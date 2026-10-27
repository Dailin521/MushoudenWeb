// The light runtime has the same player API; hls.js only ships a root declaration.
declare module 'hls.js/dist/hls.light.mjs' {
  export { default } from 'hls.js';
}
