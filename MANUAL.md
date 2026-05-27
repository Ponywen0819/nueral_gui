# NeuroTrace 使用手冊

NeuroTrace 是一個神經影像標註與量化工具。輸入皮膚切片影像 + 表皮 mask + 神經 annotation,自動跑出神經纖維網路重建,並計算穿越表皮的有效神經數。所有中間結果都可在畫面上即時調整顯示,圖也可以手動編輯後重新計數。

---

## 目錄

1. [安裝與啟動](#安裝與啟動)
2. [介面總覽](#介面總覽)
3. [圖層系統](#圖層系統)
4. [檢視 / 編輯模式](#檢視--編輯模式)
5. [Pipeline 階段](#pipeline-階段)
6. [演算法參數](#演算法參數)
7. [圖形編輯](#圖形編輯)
8. [鍵盤 / 滑鼠操作速查](#鍵盤--滑鼠操作速查)
9. [常見問題](#常見問題)

---

## 安裝與啟動

需求:Node.js 18+ 與 `pnpm`。Pipeline 後端需要 `uv` (Python package manager) 已安裝,因為 Python worker 是用 `uv run python` 啟動的。

```bash
# 第一次:取得 submodule(annotation_grow_linker + Python pipeline)
git submodule update --init --recursive

# 安裝相依套件
pnpm install

# 開發模式啟動
pnpm dev
```

打包:`pnpm build:mac` / `pnpm build:win` / `pnpm build:linux`。

---

## 介面總覽

```
┌────────────────────┬──────────────────────────────────────────┐
│                    │  ┌─ Top Toolbar ──────────────────────┐   │
│   Sidebar          │  │  Mode  |  Graph Stats  |  Clear   │   │
│                    │  └─────────────────────────────────────┘   │
│   - Layers         │                                            │
│   - Pipeline       │      Canvas (圖層 + Graph SVG overlay)     │
│                    │                                            │
│                    │      [左上角會顯示 Valid Nerves 數值]      │
└────────────────────┴──────────────────────────────────────────┘
```

- **Sidebar (左)**:上半部管理影像圖層,下半部是 Pipeline 控制
- **Top Toolbar (上)**:切換 View / Edit 模式、顯示節點 / 邊數量、Clear All 按鈕
- **Canvas (中)**:多層影像 + Graph SVG 疊圖,可平移縮放
- **Valid Nerves overlay (左上)**:跑完 Count 後浮現

---

## 圖層系統

NeuroTrace 最多會有 **5 個圖層**(由下往上 z-index):

| 圖層 | 來源 | 預設色 | 何時出現 |
|------|------|--------|----------|
| Original | 使用者上傳 | 用 Color Map 模式渲染 | 上傳後 |
| Mask | 使用者上傳(表皮 mask) | 白色 #ffffff | 上傳後 |
| **ROI Mask** | Pipeline ROI 階段產出 | 青色 #22d3ee | 跑完 ROI 後 |
| **Preprocessed** | Pipeline Preprocess 階段產出(Sato fiber map) | 粉紅 #f472b6 | 跑完 Preprocess 後 |
| Annotation | 使用者上傳(神經 annotation) | 黃色 #ffff00 | 上傳後 |
| Graph SVG | Reconstruct 後產生 / 使用者編輯 | 邊 = 藍 / 綠(有效) | 跑完 Reconstruct 後 |

### 上傳影像

Sidebar 上半 Original / Mask / Annotation 三個區塊都有 **Upload** 按鈕,點開原生檔案選取對話框。

- 支援 `png / jpg / tif / tiff / webp / bmp / gif` 等格式
- 上傳 **Original** 圖時,畫面會自動 fit-to-screen(置中 + 縮放到剛好顯示完整)
- 影像會用 `data:image/png;base64,...` data URL 儲存在 renderer state

### 圖層控制

每個圖層都有:

- **👁 Show / Hide 按鈕**(右上角)
- **Opacity slider**(0–100%)
- **Color picker**(Mask / ROI / Preprocessed / Annotation 都可選)
- **Color Map**(只有 Original 有 — 可選 Red / Green / Blue / Green Viridis 通道顯示模式)

四個非 Original 圖層(Mask / ROI / Preprocessed / Annotation)都用同樣的渲染技巧:**以原圖的亮度當 alpha 遮罩、套上選定的純色**。所以:

- 影像越亮的地方,顏色越飽和(完全不透明)
- 黑色的地方完全透明
- Opacity 100% = 完全覆蓋下方圖層;低 opacity = 半透明疊加

---

## 檢視 / 編輯模式

頂端 Toolbar 兩個按鈕切換:

### View & Pan(預設)

- 用滑鼠在畫布上自由平移 / 縮放
- 點 graph 上的邊可選取(右鍵 menu 可刪)
- 不會誤建節點

### Edit Graph

- 左鍵點空白處 → 建立新節點
- 連續左鍵 → 建立「鏈式」節點(每個新節點都會自動跟上一個節點連線)
- 右鍵 / Esc → 中止當前 chain
- 左鍵點現有節點 → 把該節點加進當前 chain

切換模式:**點 Toolbar 按鈕** 或 **按 `Tab` 鍵**。

---

## Pipeline 階段

Pipeline 拆成 **4 個獨立階段**,在 Sidebar 下半 Neural Pipeline 區塊。每個階段有狀態 icon:

- ⚪ Idle — 還沒跑
- 🔄 Running — 處理中(會 spin)
- ✅ Done — 完成
- ⚠ Error — 失敗

按前一階段完成後,後面的階段才會啟用。也可以按底下的 **Run All** 一鍵跑完四階段。

### 1. ROI Mask

接收 epidermis mask,做垂直方向 dilation(`offset_px`),產出 **分析範圍 mask**。完成後 Sidebar 自動出現 **ROI Mask** 圖層控制,Canvas 上會多一層青色覆蓋。

### 2. Preprocess

跑完整影像前處理鏈:

1. 取出 green channel(神經訊號最強)
2. Morphological opening 去背
3. CLAHE 增強對比
4. Sato vesselness filter 強化線狀結構(纖維)
5. Multi-scale max → 合成 fiber map
6. 算出 cost map(下一階段 Dijkstra 用)

完成後 Sidebar 出現 **Preprocessed** 圖層,Canvas 多一層粉紅 fiber map。

### 3. Reconstruct

從前處理 cost map + annotation 連通元件出發,做:

1. Multi-source Dijkstra 路徑搜尋
2. 找元件間的最低 cost 接觸點 → 建 component graph
3. Prune 高 cost 邊(`prune_threshold`)
4. MST(最小生成樹)
5. Skeletonize + 建 pixel-level seed graph
6. Segment detection + **Stub trim**(去掉短於 `stub_length_threshold` 的端枝)

完成後 Canvas 出現重建出的 graph(藍色節點 + 藍色邊),會 **自動接著跑 Count** 一次。

> ⚠ 注意:Reconstruct 完成會 **覆蓋** Canvas 上的 graph,使用者前一次的編輯不會被保留。

### 4. Count

對當前 graph 做穿越表皮計數:

1. Region labeling — 把 graph 切成 epidermis side / dermis side
2. 排除小子樹(覆蓋 annotation 元件數 < `min_tree_components`)
3. 統計有效穿越段(epidermis 長度 ≥ 閾值 且 dermis 長度 ≥ 閾值)

**特別之處**:Count 按鈕永遠用 **當下 Canvas 上的 graph** 去算 — 你可以在 Reconstruct 完成後,進 Edit 模式手動新增 / 刪除邊和節點,再按 Count 重新計算。

完成後:

- 左上角 **Valid Nerves: N** 數字浮現
- 有效穿越段的邊會變 **綠色 (#34D399)**
- 其他保持藍色

### Run All

一次跑 ROI → Preprocess → Reconstruct → Count。中間任一階段失敗就停下。

---

## 演算法參數

Sidebar 點 **Parameters** 按鈕開啟參數 modal。參數會 **存到 `localStorage`**,下次開 app 還在(按 modal 右上 **Reset** 復原預設)。

### Preprocessing

| 參數 | 預設 | 說明 |
|------|------|------|
| Epidermis Offset (px) | 50 | ROI mask 垂直 dilation 範圍 |
| Background Kernel | 51 | 去背用的 morphological opening kernel 大小 |
| CLAHE Clip Limit | 20 | 越高對比增強越強 |
| CLAHE Grid Size | 16 | CLAHE tile grid 邊長(正方形) |
| Sato σ Start | 3 | Sato filter 最小 scale(最細纖維寬度) |
| Sato σ Stop | 8 | Sato filter 最大 scale (exclusive) |

### Pathfinding

| 參數 | 預設 | 說明 |
|------|------|------|
| Connectivity | 8 | Dijkstra 鄰接模式(4 / 8) |
| Prune Threshold | 20 | Cost 超過這個值的元件間連線會被丟掉 |

### Postprocessing

| 參數 | 預設 | 說明 |
|------|------|------|
| Min Tree Components | 1 | 子樹覆蓋的 annotation 元件數低於此值不計入有效穿越 |
| Stub Length | 5 | 短於這個長度的端枝 segment 在 Reconstruct 階段被剪掉 |

> **參數變動不會自動重跑**。改完參數後要自己點 Re-run 該階段或按 Run All。Pipeline 後端有 cache,沒變動的中間 stage 不會重算。

---

## 圖形編輯

進入 **Edit Graph** 模式後可以手動修圖,常用於修正 Reconstruct 的結果。

### 建節點與邊

- **左鍵點空白處** — 建立新節點。如果之前已選了某個節點作為 chain 起點,還會自動建一條邊連過去
- **連續左鍵** — chain creation,持續延伸
- **左鍵點現有節點** — 該節點加入 chain(會連一條新邊)

### 結束 chain

- **右鍵任意位置** 或 **Esc** — 中止 chain,下一次點擊重新開始

### 選取與刪除

- **左鍵點邊** — 選取(會變黃 #FCD34D)
- **左鍵點節點** — 選取
- **右鍵點邊 / 節點** — 開 context menu(刪除選項)
- **Del 鍵** — 刪除目前選取的邊 / 節點
- 刪邊時,**孤立的節點(沒有任何邊連接)會自動清除**

### Clear All

Toolbar 右側紅色 ↻ 按鈕 — 清空所有節點與邊(會跳確認)。

### 編輯後重新計數

修完圖後按 Sidebar 的 **Count** 按鈕,會把你當下的 graph 序列化送回後端重新計算,Valid Nerves 數字 + 邊的綠色標示會同步更新。

---

## 鍵盤 / 滑鼠操作速查

### 全域

| 動作 | 操作 |
|------|------|
| 切換模式 | `Tab` |
| 中止當前操作 | `Esc` |
| 縮放 | 滑鼠滾輪(會以游標位置為中心) |
| 平移 | 中鍵拖曳(任何模式)/ Shift+拖曳 / Ctrl+拖曳 |

### Edit Graph 模式

| 動作 | 操作 |
|------|------|
| 建節點(及鏈接) | 左鍵 |
| 選取邊 / 節點 | 左鍵(對應元素上) |
| 開 context menu | 右鍵 |
| 結束 chain | 右鍵 / `Esc` |
| 刪除選取 | `Del` |
| 平移 | 中鍵拖曳 / Shift+拖曳 / Ctrl+拖曳 |

### View & Pan 模式

| 動作 | 操作 |
|------|------|
| 平移 | 左鍵拖曳 / 中鍵拖曳 |
| 選取邊(view 也可) | 左鍵點邊 |
| Context menu | 右鍵 |

---

## 常見問題

### 為什麼 Annotation 設 100% opacity 還是有點透明?

這個版本已修掉。如果還有問題,確認 Annotation 圖層的 opacity 拉到 1.00(100%)即可完全覆蓋下方圖層。

### Reconstruct 完成後,Count 用的是重建出來的圖還是我編輯後的圖?

**Run All** 或 **點 Reconstruct 按鈕**(會自動接 Count)時,Count 永遠用 **剛重建的 graph**,你的編輯會被覆蓋。

**單獨點 Count 按鈕** 時,Count 用 **當下 Canvas 上的 graph**,如果你編輯過就用編輯後的版本。

所以工作流程是:Reconstruct → 編輯 graph → 單獨按 Count 重算。

### 我換了 ROI 參數 (`offset_px`),要重跑哪些?

理論上 ROI / Preprocess / Reconstruct / Count 都受影響(它們全部 downstream 都依賴 ROI mask)。按 **Run All** 最簡單。後端有 cache,沒變動的中間 stage 不會重算。

只想看 ROI 變化的話,單按 **ROI Mask** 即可看到 ROI 圖層更新。

### Pipeline 卡住怎麼辦?

- 看 Sidebar Error 區塊(紅色框)是否有錯誤訊息
- 看終端機(`pnpm dev` 跑的那個視窗)的 stderr — Python worker 的錯誤會顯示在那邊
- 如果 Python worker 死掉,目前只能關 app 重開讓它重新 spawn

### 我換了三張新圖,要不要重新初始化什麼?

不用。換圖後 Pipeline 後端會自動偵測(用 data URL 長度當 signature)、丟掉舊 session、開新的。直接按你要的階段即可。

### 上傳的 TIF 圖太大跑很慢怎麼辦?

目前沒有降採樣選項。可考慮先把 TIF 壓成 PNG 或縮小尺寸再上傳。Sato filter 跟 Dijkstra 的時間是 **O(像素數)**,影像翻倍 = 時間翻倍。

### 跑出來的 Valid Nerves 是 0,但是 graph 看起來明明有東西

可能性:

- **Min Tree Components 設太高** — 預設是 1,如果你調高了,小子樹會被排除
- **annotation 沒覆蓋到 fiber** — 計數要求 graph 子樹要「沾到」annotation 連通元件,沾不到就不算
- **沒有真的跨表皮** — Counting 只算 epidermis side ↔ dermis side 都有夠長 path 的段

可以用 Edit 模式手動加幾條穿越邊測試,或檢查 Mask 是否正確標出表皮位置。

---

## 顏色一覽

跑完 Pipeline 後,Canvas 上的色彩意義:

- 🔵 藍色邊 — 一般 graph 邊
- 🟢 綠色邊 — 被認定為「有效穿越段」的邊(對應 Valid Nerves 計數)
- 🟡 黃色邊 — 當前選取的邊
- 🔵 藍色節點 — graph 節點
- 🟠 橘色節點 — 當前 chain 的起點(編輯中)

預設圖層顏色:

- 白 — Mask
- 青 — ROI Mask
- 粉紅 — Preprocessed (Sato fiber map)
- 黃 — Annotation
