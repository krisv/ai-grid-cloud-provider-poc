import { useEffect, type RefObject } from 'react';
export const resolveSelectPopperAppendTo = (element: HTMLElement | null): HTMLElement =>
  element?.closest<HTMLElement>('.pf-v6-c-modal-box') ?? document.body;
export const useModalOverflowUnlock = (isOpen: boolean, ref: RefObject<HTMLElement>) => {
  useEffect(() => {
    const body = ref.current?.closest<HTMLElement>('.pf-v6-c-modal-box__body');
    if (!isOpen || !body) return;
    const previous = body.style.overflow;
    body.style.overflow = 'visible';
    return () => { body.style.overflow = previous; };
  }, [isOpen, ref]);
};
