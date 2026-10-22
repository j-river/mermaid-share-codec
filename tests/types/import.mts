import { encodeState, decodeState, createShareUrl, extractCode, type ShareState, type Result } from 'mermaid-share-codec';
const state: ShareState = { code: 'flowchart LR\n A-->B', mmo: { theme: 'default' } };
const token: string = encodeState(state);
const result = decodeState(token);
if (result.ok) { const code: string = result.value.code; void code; }
else { const message: string = result.error.code; void message; }
const url: string = createShareUrl(state, { baseUrl: 'https://mermaid.live/edit' });
const code: Result<string> = extractCode(url);
void code;
// @ts-expect-error Mermaid configuration is a JSON string, not a config object.
encodeState({ code: 'graph TD; A-->B', mermaid: { theme: 'dark' } });
