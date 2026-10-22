import codec = require('mermaid-share-codec');
const token: string = codec.encodeState({ code: 'graph TD; A-->B' });
const result: codec.Result<string> = codec.extractCode(token);
void result;
