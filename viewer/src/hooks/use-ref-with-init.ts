// Dice UI's `use-ref-with-init` (https://diceui.com, `sadmann7/diceui` on GitHub, MIT), added with `compare-slider`.

import * as React from "react";

const UNINITIALIZED = {};

function useRefWithInit<T>(init: () => T): React.RefObject<T> {
  const ref = React.useRef<T | typeof UNINITIALIZED>(UNINITIALIZED);

  if (ref.current === UNINITIALIZED) {
    ref.current = init();
  }

  return ref as React.RefObject<T>;
}

export { useRefWithInit };
