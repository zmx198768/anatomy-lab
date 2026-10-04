# 第三方数据与软件署名

项目应用作者：曾铭新（zmx198768），Wechat:8574157。以下数据与软件归其各自作者所有，项目作者署名不替代这些署名。

## BodyParts3D 4.3

**BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.**

- 官方项目：https://lifesciencedb.jp/bp3d/
- 官方存档许可：https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- 许可条款：https://creativecommons.org/licenses/by/4.0/
- 许可说明依据项目整理时核对的官方页面：2025-02-27 更新为 CC BY 4.0。
- 对应目录：`dist/atlas/`、`source-data/official/`、`source-data/MANIFEST-4.3.csv`。

本项目调整了坐标轴、单位与显示材质，并进行分批 gzip 压缩和 16 位位置量化，保留导入清单的全部 3210 个网格和原始三角面。身体参数变形属于应用提供的模拟效果，不是原始数据集提供的个体模型。

分发或进一步使用上述模型时，请保留原作者、来源、许可链接及修改说明。

## Three.js 与 OrbitControls

- Three.js 0.170.0：https://github.com/mrdoob/three.js
- 许可：MIT，完整许可文本见 [`dist/vendor/LICENSE-three.txt`](dist/vendor/LICENSE-three.txt)。
- 对应文件：`dist/vendor/three.module.js`、`dist/vendor/OrbitControls.js`。

## 数据获取与中文术语参考

- 下载流程参考：https://github.com/olivercase/body_parts_3d_api
- 中文检索术语参考：https://github.com/jixiangying/anatomy
- 对应参考数据：`source-data/chinese-reference.json`。

中文名称仅用于英文名称完全匹配的条目；未匹配的条目保留官方英文名称。参考数据没有被重新声明为本项目作者的原创数据，也不由本项目另行授予许可，进一步使用时应核对来源项目的适用条款。

页面内的来源及适用范围说明见 [`dist/credits.html`](dist/credits.html)。项目自有代码尚未另行授予开源许可；第三方许可不自动扩展为本仓库全部代码的许可。
