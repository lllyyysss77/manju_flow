import { useEffect, useState } from 'react';

export const useImageOrientation = (url?: string | null) => {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    if (!url) {
      setIsPortrait(false);
      return;
    }

    let cancelled = false;
    const image = new Image();

    const updateOrientation = () => {
      if (cancelled) return;
      if (!image.naturalWidth || !image.naturalHeight) {
        setIsPortrait(false);
        return;
      }
      setIsPortrait(image.naturalHeight > image.naturalWidth);
    };

    image.onload = updateOrientation;
    image.onerror = () => {
      if (!cancelled) setIsPortrait(false);
    };
    image.src = url;

    if (image.complete) {
      updateOrientation();
    }

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [url]);

  return isPortrait;
};
