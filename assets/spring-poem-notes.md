# 《春声》诗笺透明背景

- 日期：2026-10-21。
- 来源：用户提供的《春声》诗笺插画；重复的非透明原图已清理，保留当前使用的完整透明版本。
- 当前页面素材：`spring-poem-card-transparent-v2.webp`，1091 × 1442，RGBA。四个画布角 alpha 为0，保留纸张本体、灰绿衬纸、花枝、礼物盒和小羊。
- 处理方式：内置 imagegen，`background-extraction`，`transparent_background=true`。未使用CLI或新增网站运行依赖。
- 保留画布比例和叉号位置，继续用真实按钮覆盖图中的叉号；弹窗背景透明，阴影跟随图片轮廓。

## 最终提示词

```text
Use case: background-extraction. Edit target: the provided Chinese poem card. Remove ONLY the flat ivory/off-white OUTSIDE background around the irregular paper card, sage-green backing paper, top-left flowering branch and bottom-right sheep gift box. Make that exterior background truly transparent (alpha 0), including gaps between the branch leaves outside the card. Preserve the ENTIRE opaque ivory textured paper interior, its thin brown irregular edge, sage backing, flowers, leaves, petals on paper, gift box, sheep and the small X at the top right. This is background removal, NOT a redesign. Keep the exact same portrait canvas aspect ratio, framing, all object positions and proportions so a pre-existing click target at x=88.4%, y=8.6% still aligns with the X. Preserve all Chinese handwriting exactly with no redrawing or changes: title 春声, then 春风一夜花初放 / 季雨几日木又生 / 前路纵遥终有至 / 且将欢意赴新程. No added border, no outer rectangular panel, no outer white/cream halo. Preserve original design and text as faithfully as possible.
```

## 网页交付格式（2026-10-21）

保留同名 PNG 源文件，网页使用原尺寸无损 WebP（lossless=true，effort=6），未经缩放或重新绘制。已比较解码像素，所有可见像素和透明度与 PNG 一致。
