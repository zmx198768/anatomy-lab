# 开发与数据说明

## 前端模块职责

`dist/atlas-state.js` 维护结构清单、启用状态、搜索及区域/组合筛选，不依赖 DOM。`dist/atlas-loader.js` 读取 manifest 和压缩批次，用 Three.js 建立网格，并保存原始位置用于可逆体型变形。`dist/atlas-app.js` 负责 UI、相机、拾取、材质、加载状态、工具注册与上述模块的连接。

前端使用浏览器原生 ES Modules 和 import map，本地 `dist/vendor/` 提供 Three.js。无需 bundler、后端或 API 密钥。保持资源 URL 为相对路径，可以部署在 `/anatomy/` 等子路径。

## 重新获取及转换原始模型（可选）

日常运行直接使用已提交的 `dist/atlas/`。只有需要重建数据时才执行：

```bash
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS / Linux: source .venv/bin/activate
python -m pip install -r requirements-data.txt
python source-data/acquire.py
python source-data/convert.py
npm test
```

下载器按 `MANIFEST-4.3.csv` 与 `official/FMA2Obj.txt` 的期望模型集合检查覆盖，分批缓存官方 ZIP，再写入独立 OBJ。已有 ZIP 缓存可复用。需要官方服务可访问，并预留至少 1 GB 磁盘空间。

转换器直接读取 OBJ 头部名称、FMA 编号和几何数据，输出模型分块、索引、组件 CSV 与覆盖报告。转换会覆盖 `dist/atlas/` 的对应文件；修改转换逻辑前应提交或备份已有资源。更新资源后应一起提交全部批次与索引，并运行完整校验。

## 模型批次格式

`manifest.json` 中 `chunks` 描述 gzip 文件名、压缩/解压字节数、SHA-256 和包含的 FJ ID；`structures` 给出各组件的字节偏移、顶点数、索引类型、包围盒、系统分类、区域及编号。

解压后的批次由对齐的坐标和索引数组组成。每个顶点用三个 `Uint16` 值量化，其位置按 `min + quantized / 65535 * span` 还原。三角索引根据 `indexBytes` 使用 `Uint16` 或 `Uint32`。索引偏移按 4 字节对齐。浏览器加载后计算法线，按系统设置材质。

`concepts` 保存官方 FMA 组合的已收录成员编号；区域筛选结合官方映射与空间位置，界面系统分类用于检索，不构成新的医学本体。

## 验证

`npm test` 包含全量二进制、状态逻辑与真实加载器校验；它不代替浏览器 WebGL、交互或截图验证。新增 UI 功能后，应实际检查加载、搜索、显隐、隔离、相机、组合与参数变化。WebMCP 应在支持的宿主环境另行验证。

格式化前端使用 `npm run format`。Python 脚本可用 `python -m black source-data/acquire.py source-data/convert.py`，Black 是可选开发工具。

## 作者

曾铭新 · [zmx198768](https://github.com/zmx198768) · Wechat:8574157
