import { createApi } from './app.js';

const app = await createApi();
await app.listen(3000, '127.0.0.1');
