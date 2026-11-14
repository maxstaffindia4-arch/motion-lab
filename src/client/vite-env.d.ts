/// <reference types="vite/client" />

// Vite ?worker suffix type declarations
declare module '*?worker' {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
