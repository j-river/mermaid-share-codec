# mermaid-share-codec

在 Node.js 和浏览器中编码、解码 Mermaid Live Editor 分享链接。可以从链接恢复图表源码，也可以为自己的编辑器生成分享链接，无需加载 Mermaid 渲染器或请求远程服务。

[English](README.md) · [在线演示](https://huggingface.co/spaces/j-river/mermaid-share-codec) · [npm](https://www.npmjs.com/package/mermaid-share-codec)

## 快速开始

需要 Node.js 22 或更高版本。

```sh
npm install mermaid-share-codec
```

```js
import { createShareUrl, extractCode } from 'mermaid-share-codec';

const code = 'flowchart LR\n  A[Write] --> B[Share]\n';
const url = createShareUrl({ code }, { baseUrl: 'https://mermaid.live/edit' });
const result = extractCode(url);
if (result.ok) console.log(result.value);
else console.error(result.error.code, result.error.message);
```

## 命令行

把现有 `.mmd` 文件转换成分享链接：

```sh
npx mermaid-share-codec encode diagram.mmd
```

把保存的分享链接恢复成源码：

```sh
npx mermaid-share-codec decode --file saved-link.txt
```

查看完整参数：

```sh
npx mermaid-share-codec --help
```

标准输出可以重定向到文件；解码不附加换行，诊断信息写入标准错误。也支持标准输入、只输出 token，以及用 `--json` 恢复整个状态。

## 适用场景与边界

- 从已有分享链接中恢复源码，再继续编辑或提交到版本库。
- 为文档工具、编辑器和自动化脚本增加分享能力。
- 保留 Unicode、空白、CRLF 和合法 JSON 元数据，支持 ESM、CommonJS 和 TypeScript。
- 这是编解码工具，不检查 Mermaid 语法，不渲染图片，不处理网站私有的云端 ID。
- 压缩不是加密。拿到链接的人能读取内容；不要把凭证或机密资料放入分享链接。
- 解码内容仍是不可信数据，不能直接把任意配置合并到渲染器中。输入、解压后大小和嵌套深度有上限，详见英文文档。

需要直接编辑和导出图表，可使用 [Mermaid Online](https://mermaidonline.org/)。本库是独立项目，不是 Mermaid 官方项目。

## 开发与许可

```sh
npm ci --ignore-scripts
npm run check
npm run test:package
```

MIT。依赖和测试用上游代码的许可证说明见英文文档及对应源码目录。
