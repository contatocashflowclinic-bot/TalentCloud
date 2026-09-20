import { useRef } from 'react';

/**
 * Click-outside-to-close handlers for a modal's backdrop `<div>`.
 *
 * A plain `onClick={onClose}` on the backdrop closes the modal on more than just an outside
 * click: selecting text inside the modal (e.g. dragging over a title you just typed to copy it)
 * can end the drag with the mouse released over the backdrop, and that mouseup's click event
 * fires with the backdrop as its target — indistinguishable, by `onClick` alone, from someone
 * deliberately clicking outside. Requiring the mousedown to ALSO have started on the backdrop
 * itself is what tells the two apart.
 */
export function useBackdropClose(onClose: () => void) {
  const mouseDownOnBackdrop = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => {
      mouseDownOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose();
    }
  };
}
