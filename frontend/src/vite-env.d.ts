/// <reference types="vite/client" />

// Allow importing plain CSS files in TS.
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

