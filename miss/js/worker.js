// WebLLM engine host — runs inference off the main thread so the UI stays fluid.
import { WebWorkerMLCEngineHandler } from 'https://esm.run/@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = msg => handler.onmessage(msg);
