const isObject = (value) => value !== null && typeof value === "object";

let activeEffect = null;

const cleanupEffect = (effectFn) => {
  if (!effectFn.deps) {
    return;
  }
  for (const dep of effectFn.deps) {
    dep.delete(effectFn);
  }
  effectFn.deps.length = 0;
};

const effect = (fn) => {
  const wrapped = () => {
    cleanupEffect(wrapped);
    activeEffect = wrapped;
    try {
      fn();
    } finally {
      activeEffect = null;
    }
  };
  wrapped.deps = [];
  wrapped();
  return wrapped;
};

const track = (dep) => {
  if (!activeEffect) {
    return;
  }
  dep.add(activeEffect);
  activeEffect.deps.push(dep);
};

const trigger = (dep) => {
  for (const eff of Array.from(dep)) {
    eff();
  }
};

const ref = (initialValue) => {
  let value = initialValue;
  const dep = new Set();
  return {
    __v_isRef: true,
    get value() {
      track(dep);
      return value;
    },
    set value(newValue) {
      if (Object.is(value, newValue)) {
        return;
      }
      value = newValue;
      trigger(dep);
    }
  };
};

const isRef = (value) => isObject(value) && value.__v_isRef === true;

const reactive = (target) => {
  if (!isObject(target)) {
    return target;
  }
  const depMap = new Map();

  return new Proxy(target, {
    get(obj, key, receiver) {
      const result = Reflect.get(obj, key, receiver);
      if (!activeEffect) {
        return result;
      }
      let dep = depMap.get(key);
      if (!dep) {
        dep = new Set();
        depMap.set(key, dep);
      }
      track(dep);
      return isObject(result) ? reactive(result) : result;
    },
    set(obj, key, value, receiver) {
      const oldValue = obj[key];
      const result = Reflect.set(obj, key, value, receiver);
      if (!Object.is(oldValue, value)) {
        const dep = depMap.get(key);
        if (dep) {
          trigger(dep);
        }
      }
      return result;
    }
  });
};

const computed = (getter) => {
  const result = ref();
  effect(() => {
    result.value = getter();
  });
  return {
    __v_isRef: true,
    get value() {
      return result.value;
    },
    set value(_) {
      throw new Error("Computed refs are read-only");
    }
  };
};

const proxyRefs = (target) =>
  new Proxy(target, {
    get(obj, key) {
      const value = Reflect.get(obj, key);
      return isRef(value) ? value.value : value;
    },
    set(obj, key, value) {
      const oldValue = obj[key];
      if (isRef(oldValue) && !isRef(value)) {
        oldValue.value = value;
        return true;
      }
      return Reflect.set(obj, key, value);
    }
  });

let currentInstance = null;

const onMounted = (callback) => {
  if (currentInstance) {
    currentInstance.mounted.push(callback);
    return;
  }
  callback();
};

const h = (type, props = null, children = null) => ({
  type,
  props: props ?? {},
  children
});

const mountChildren = (children, container) => {
  if (children == null) {
    return;
  }
  if (!Array.isArray(children)) {
    mountVNode(children, container);
    return;
  }
  for (const child of children) {
    mountVNode(child, container);
  }
};

const applyProps = (el, props = {}) => {
  for (const [key, value] of Object.entries(props)) {
    if (value == null) {
      continue;
    }
    if (key === "class") {
      el.className = value;
      continue;
    }
    if (key === "style") {
      if (typeof value === "string") {
        el.style.cssText = value;
      } else if (isObject(value)) {
        for (const [propName, propValue] of Object.entries(value)) {
          el.style[propName] = propValue;
        }
      }
      continue;
    }
    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.slice(2).toLowerCase();
      el.addEventListener(eventName, value);
      continue;
    }
    if (key in el) {
      try {
        el[key] = value;
        continue;
      } catch (_) {
        // fall through to setAttribute
      }
    }
    el.setAttribute(key, value);
  }
};

const mountComponent = (vnode, container) => {
  const component = vnode.type;
  const props = vnode.props ?? {};
  const instance = {
    mounted: [],
    isMounted: false
  };
  const previousInstance = currentInstance;
  currentInstance = instance;
  const setupResult = component.setup ? component.setup(props) : {};
  currentInstance = previousInstance;
  const context = proxyRefs({ ...setupResult, props });
  const subTree = component.render(context, h, props, vnode.children);
  const fragment = document.createDocumentFragment();
  mountVNode(subTree, fragment);
  container.appendChild(fragment);
  if (!instance.isMounted) {
    instance.isMounted = true;
    for (const callback of instance.mounted) {
      callback.call(context);
    }
  }
};

const mountVNode = (vnode, container) => {
  if (vnode == null) {
    return;
  }
  if (typeof vnode === "string" || typeof vnode === "number") {
    container.appendChild(document.createTextNode(String(vnode)));
    return;
  }
  if (Array.isArray(vnode)) {
    for (const child of vnode) {
      mountVNode(child, container);
    }
    return;
  }
  if (typeof vnode.type === "function") {
    const rendered = vnode.type({ ...(vnode.props ?? {}) }, vnode.children);
    mountVNode(rendered, container);
    return;
  }
  if (typeof vnode.type === "object") {
    mountComponent(vnode, container);
    return;
  }
  const el = document.createElement(vnode.type);
  applyProps(el, vnode.props);
  mountChildren(vnode.children, el);
  container.appendChild(el);
};

const createApp = (rootComponent) => ({
  mount(target) {
    const container =
      typeof target === "string" ? document.querySelector(target) : target;
    if (!container) {
      throw new Error("Container element not found");
    }
    const instance = {
      mounted: [],
      isMounted: false
    };
    const previousInstance = currentInstance;
    currentInstance = instance;
    const setupResult = rootComponent.setup ? rootComponent.setup() : {};
    currentInstance = previousInstance;
    const context = proxyRefs(setupResult ?? {});

    const renderComponent = () => {
      container.innerHTML = "";
      const subTree = rootComponent.render(context, h);
      mountVNode(subTree, container);
      if (!instance.isMounted) {
        instance.isMounted = true;
        for (const callback of instance.mounted) {
          callback.call(context);
        }
      }
    };

    effect(renderComponent);
  }
});

export { computed, createApp, h, onMounted, reactive, ref };
