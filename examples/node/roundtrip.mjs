import { createShareUrl, extractCode } from 'mermaid-share-codec';
const code = 'flowchart LR\n  A[Write] --> B[Share]\n';
const url = createShareUrl({ code }, { baseUrl: 'https://mermaid.live/edit' });
const result = extractCode(url);
if (!result.ok) throw result.error;
console.log(url);
console.log(result.value);
