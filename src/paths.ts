import { resolve } from 'node:path';

// Data belongs to the launch directory; UI assets stay with the application code.
export function appPaths(directory=process.cwd()){
 return {dataset:resolve(directory,'receipts/dataset.json'),results:resolve(directory,'results')};
}
