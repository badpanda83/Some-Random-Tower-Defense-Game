export interface PageActivitySource {
  isAway(): boolean;
  subscribe(listener: () => void): () => void;
}

function isBrowserPageAway(): boolean {
  return document.visibilityState === "hidden" || !document.hasFocus();
}

export const browserPageActivity: PageActivitySource = {
  isAway: isBrowserPageAway,
  subscribe(listener) {
    document.addEventListener("visibilitychange", listener);
    window.addEventListener("blur", listener);
    window.addEventListener("focus", listener);
    window.addEventListener("pagehide", listener);
    window.addEventListener("pageshow", listener);
    return () => {
      document.removeEventListener("visibilitychange", listener);
      window.removeEventListener("blur", listener);
      window.removeEventListener("focus", listener);
      window.removeEventListener("pagehide", listener);
      window.removeEventListener("pageshow", listener);
    };
  },
};
