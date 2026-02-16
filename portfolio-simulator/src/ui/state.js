export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    dispatch: (action) => {
      state = reducer(state, action);
      for (const fn of listeners) fn(state);
    }
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "SET_CONFIG":
      return { ...state, config: { ...state.config, ...action.payload } };
    case "SET_RESULT":
      return { ...state, result: action.payload };
    case "SET_BANDS":
      return { ...state, bands: action.payload };
    case "SET_COMPARE":
      return { ...state, compare: action.payload };
    default:
      return state;
  }
}
