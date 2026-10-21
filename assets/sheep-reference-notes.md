# 小羊参考素材

## v3 统一描边（2026-10-21）

- 当前页面素材：`sheep-outlined-v3.webp`。以用户提供的小羊插画为来源，经内置imagegen调整为轻微微笑，并统一描边和羊毛内部阴影；未使用的中间版本已清理。
- 保留微笑、五官、比例、透明背景和原有位置；网页SVG补一层0.55单位的暖灰褐细轮廓，使缩小显示时仍清楚。阴影由网页单独绘制，不写进素材。
- 参考风格：当时首页截图中的盒子、信封、花与爱心。
- 最终提示词：

```text
Use case: precise-object-edit. Image 1 is the EDIT TARGET: existing transparent smiling lamb. Image 2 is STYLE REFERENCE ONLY: website screenshot, specifically the gift box, envelope, flower and little heart. Refine ONLY the lamb linework and fill treatment so it belongs with these flat hand-drawn objects. Preserve exact lamb identity, head/body proportions, wide sideways ears, eyes and highlights, blush, pink nose, tiny closed-mouth smile, four short legs, no hat. Preserve exact portrait/square canvas dimensions, framing, object placement, scale and transparent alpha outside lamb and between legs. Replace the washed-out broad watercolor contour with a clearly defined thin warm gray-brown pencil outline similar to the box lines (#716b54), consistently visible around the wool silhouette, ears, face and hooves. Not thick black sticker outlines. Simplify wool's interior watercolor shadows to a few delicate cream/beige curls and very faint paper texture; flatter warm ivory fill, no gradients, no muddy gray edge. Keep cozy soft illustrated character, not vector-perfect. Do not add any shadow, halo, background, grass, flowers, props or text. Output genuine transparent PNG. Entire ear tips and hooves intact. Do not redesign the face.
```

## 网页交付格式（2026-10-21）

保留同名 PNG 源文件，网页使用原尺寸无损 WebP（lossless=true，effort=6），未经缩放或重新绘制。已比较解码像素，所有可见像素和透明度与 PNG 一致。
