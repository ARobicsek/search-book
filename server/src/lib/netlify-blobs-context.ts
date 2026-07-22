// Re-export connectLambda from the SERVER's @netlify/blobs instance so the Netlify
// function entry (netlify/functions/api.ts) and storage.ts share ONE bundled module
// instance. Netlify Blobs keeps its request context in module scope, so a duplicate
// instance (e.g. one resolved from repo-root node_modules) would set the context in a
// copy that storage.ts's getStore() never sees. Importing through this server file
// forces both to resolve @netlify/blobs from server/node_modules → single instance.
export { connectLambda } from '@netlify/blobs';
