# 窗边读书前景素材

- 输入：用户提供的 `窗边女孩.png`。
- 成品：`quiet-reading-foreground-v1.png`，1536 × 1024，RGBA，保留透明度。
- 方式：内置 imagegen 工具，background-extraction，transparent_background=true。没有使用CLI或新增网站运行依赖。
- 用途：女孩、书、抱枕、茶杯和绿植组成静态室内层，窗外天气与杯口热气由网页单独绘制和控制。

## 实际使用的提示词

```text
Use case: background-extraction. Asset type: transparent indoor foreground layer for an existing interactive cozy window illustration on a personal website. Edit target: the attached image. Extract and preserve the EXACT illustrated girl seated cross-legged reading her green book, her hair bun, cream sweater, green trousers and white socks; preserve the cushions behind her, the teacup in front-left, and the potted plant at left. Preserve the original hand-drawn outlines, muted sage/cream/brown palette, facial identity, original poses, object sizes relative to one another, and overall relative composition. Remove the entire arched window, all outdoor rain, clouds and scenery, and the entire cream paper background. Make the space between all foreground objects genuinely transparent, including plant leaf gaps and cup-handle hole. Do not redraw the window or add a room. No sky, no background panel, no baked-in steam: steam will animate separately in the website. Keep only a subtle small grounding shadow under the foreground objects, with transparent edges. Fit these indoor foreground objects together as one tightly composed landscape cutout with modest transparent padding, around a 3:2 canvas. The plant belongs at left, girl and pillows at right, cup between left foreground and girl. The very highest point of the cutout is the girl's bun; all subjects fully visible without cropping. No text, watermark, frame, border, or extra objects.
```
