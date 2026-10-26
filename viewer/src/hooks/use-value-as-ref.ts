// Dice UI's `use-value-as-ref` (https://diceui.com, `sadmann7/diceui` on GitHub, MIT), added with `compare-slider`.
// Diorama's changes are marked `Diorama:`.

import * as React from "react";

function useValueAsRef<T>(value: T) {
  const ref = React.useRef<T>(value);

  // Diorama: React's own layout effect (the viewer is not rendered on a server), not `radix-ui/internal`'s.
  React.useLayoutEffect(() => {
    ref.current = value;
  });

  return ref;
}

export { useValueAsRef };
