import fs from "node:fs";
import path from "node:path";

const outDir = new URL("./", import.meta.url);

let idCounter = 1;
const id = () => `crm_diagram_${String(idCounter++).padStart(4, "0")}`;

const base = {
  version: 141,
  versionNonce: 1,
  isDeleted: false,
  fillStyle: "solid",
  strokeWidth: 2,
  roughness: 1,
  opacity: 100,
  angle: 0,
  strokeColor: "#1f2937",
  backgroundColor: "transparent",
  groupIds: [],
  frameId: null,
  roundness: { type: 3 },
  seed: 1,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: false,
};

const colors = {
  io: "#dbeafe",
  process: "#e8f5e9",
  sidecar: "#f3e8ff",
  meta: "#fef3c7",
  muted: "#f3f4f6",
  parallel: "#eef2ff",
  text: "#111827",
  lightText: "#4b5563",
  stroke: "#1f2937",
  future: "#9ca3af",
};

function rect({ x, y, width, height, fill, stroke = colors.stroke, dashed = false, opacity = 100, groupIds = [] }) {
  return {
    ...base,
    id: id(),
    type: "rectangle",
    x,
    y,
    width,
    height,
    strokeColor: stroke,
    backgroundColor: fill,
    strokeStyle: dashed ? "dashed" : "solid",
    opacity,
    groupIds,
  };
}

function text({ x, y, text, size = 18, color = colors.text, width, height, groupIds = [], align = "center" }) {
  const lines = text.split("\n");
  const computedWidth = width ?? Math.max(...lines.map((line) => line.length)) * size * 0.58;
  const computedHeight = height ?? lines.length * size * 1.3;
  return {
    ...base,
    id: id(),
    type: "text",
    x,
    y,
    width: computedWidth,
    height: computedHeight,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    roughness: 0,
    fontSize: size,
    fontFamily: 1,
    text,
    rawText: text,
    textAlign: align,
    verticalAlign: "top",
    containerId: null,
    originalText: text,
    lineHeight: 1.25,
    groupIds,
  };
}

function box({ x, y, width = 310, height = 88, title, note, fill = colors.process, dashed = false, stroke, opacity, groupIds = [] }) {
  const elements = [rect({ x, y, width, height, fill, dashed, stroke, opacity, groupIds })];
  elements.push(text({ x: x + 16, y: y + 14, width: width - 32, text: title, size: 18, groupIds }));
  if (note) {
    elements.push(text({ x: x + 18, y: y + 43, width: width - 36, text: note, size: 12, color: colors.lightText, groupIds }));
  }
  return elements;
}

function arrow({ x1, y1, x2, y2, dashed = false, color = colors.stroke, label, labelDx = 0, labelDy = 0 }) {
  const line = {
    ...base,
    id: id(),
    type: "arrow",
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    strokeColor: color,
    backgroundColor: "transparent",
    strokeStyle: dashed ? "dashed" : "solid",
    roundness: { type: 2 },
    points: [
      [0, 0],
      [x2 - x1, y2 - y1],
    ],
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
  };
  const elements = [line];
  if (label) {
    elements.push(
      text({
        x: (x1 + x2) / 2 - 70 + labelDx,
        y: (y1 + y2) / 2 - 16 + labelDy,
        width: 140,
        text: label,
        size: 12,
        color,
      }),
    );
  }
  return elements;
}

function scene(elements) {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      theme: "light",
      viewBackgroundColor: "#ffffff",
      currentItemFontFamily: 1,
      currentItemFontSize: 18,
      currentItemStrokeColor: colors.stroke,
      currentItemBackgroundColor: "transparent",
    },
    files: {},
  };
}

function writeScene(fileName, elements) {
  fs.writeFileSync(path.join(outDir.pathname, fileName), `${JSON.stringify(scene(elements), null, 2)}\n`);
}

function project1() {
  idCounter = 1;
  const elements = [];
  elements.push(text({ x: 215, y: 20, text: "Project 1: Timeline Generator", size: 28, width: 430 }));

  const x = 260;
  const w = 340;
  const h = 86;
  const ys = [90, 210, 330, 450, 570, 690, 810];
  const main = [
    { title: "Accelo .xls Export", fill: colors.io },
    { title: "Parser & Hierarchy Builder", note: "reconstructs parent/child tree\nfrom Owner Object column." },
    { title: "Milestone Filter", note: "keeps only Client Review /\nFeedback / Approval rows." },
    { title: "Track Mapper" },
    { title: "Date Range Calculator", note: "earliest start, latest end per track." },
    { title: "Excel Renderer (openpyxl)", note: "weekly columns, color fills,\nmerged headers." },
    { title: "Formatted .xlsx Timeline", fill: colors.io },
  ];

  main.forEach((item, index) => {
    elements.push(...box({ x, y: ys[index], width: w, height: h, ...item }));
  });

  for (let i = 0; i < ys.length - 1; i++) {
    elements.push(...arrow({ x1: x + w / 2, y1: ys[i] + h, x2: x + w / 2, y2: ys[i + 1] }));
  }

  elements.push(...box({ x: 720, y: 345, width: 280, height: 76, title: "Claude\n(semantic grouping)", fill: colors.sidecar, dashed: true }));
  elements.push(...box({ x: 700, y: 465, width: 320, height: 86, title: "Template Library\n(JSON configs)", fill: colors.sidecar }));
  elements.push(...arrow({ x1: 700, y1: 508, x2: 600, y2: 493, label: "applies saved mapping", labelDy: -22 }));
  elements.push(...arrow({ x1: 860, y1: 421, x2: 860, y2: 465, dashed: true, label: "proposes mapping\nfor new project types", labelDx: 76 }));
  elements.push(...arrow({ x1: 600, y1: 536, x2: 700, y2: 544, dashed: true, label: "saves approved mapping", labelDy: 18 }));

  elements.push(...box({ x: 650, y: 90, width: 260, height: 76, title: "Accelo API", fill: colors.io, dashed: true, stroke: colors.future, opacity: 70 }));
  elements.push(...arrow({ x1: 650, y1: 128, x2: x + w, y2: 253, dashed: true, color: colors.future, label: "alternate Stage 3 input", labelDx: 24 }));

  elements.push(text({ x: 40, y: 935, width: 960, text: "Legend: light blue = inputs / outputs, green = processing, purple = sidecar / external systems, dashed gray = optional future path.", size: 13, color: colors.lightText, align: "left" }));
  return elements;
}

function project2() {
  idCounter = 1;
  const elements = [];
  elements.push(text({ x: 310, y: 20, text: "Project 2: Reporting Automation", size: 28, width: 520 }));

  const futureGroup = "stage4_future";
  elements.push(rect({ x: 150, y: 70, width: 840, height: 120, fill: "transparent", dashed: true, stroke: colors.future, opacity: 65, groupIds: [futureGroup] }));
  elements.push(text({ x: 165, y: 78, text: "Stage 4: future expansion", size: 14, color: colors.future, width: 210, align: "left", groupIds: [futureGroup] }));
  ["Meta Export", "LinkedIn Export", "DCM Export"].forEach((name, i) => {
    elements.push(...box({ x: 180 + i * 165, y: 115, width: 135, height: 50, title: name, fill: colors.io, dashed: true, stroke: colors.future, opacity: 70, groupIds: [futureGroup] }));
  });
  elements.push(...box({ x: 720, y: 110, width: 190, height: 62, title: "Export Ingester", fill: colors.process, dashed: true, stroke: colors.future, opacity: 70, groupIds: [futureGroup] }));
  [247, 412, 577].forEach((inputX) => elements.push(...arrow({ x1: inputX, y1: 165, x2: 720, y2: 141, dashed: true, color: colors.future })));

  elements.push(...box({ x: 170, y: 240, width: 290, height: 72, title: "Investment Tables .xlsx", fill: colors.io }));
  elements.push(...box({ x: 610, y: 240, width: 290, height: 72, title: "Performance Charts .xlsx", fill: colors.io }));
  elements.push(...arrow({ x1: 785, y1: 172, x2: 315, y2: 240, dashed: true, color: colors.future }));
  elements.push(...arrow({ x1: 845, y1: 172, x2: 755, y2: 240, dashed: true, color: colors.future }));

  elements.push(...box({ x: 250, y: 375, width: 570, height: 92, title: "Parser & Data Normalizer", note: "navigates hierarchy, cross-refs 2025/2026,\nnormalizes naming." }));
  elements.push(...arrow({ x1: 315, y1: 312, x2: 445, y2: 375 }));
  elements.push(...arrow({ x1: 755, y1: 312, x2: 625, y2: 375 }));

  elements.push(rect({ x: 100, y: 515, width: 870, height: 155, fill: colors.parallel, stroke: "#c7d2fe", opacity: 45 }));
  elements.push(text({ x: 118, y: 526, text: "Parallel processing", size: 14, color: colors.lightText, width: 160, align: "left" }));
  elements.push(...box({ x: 120, y: 555, width: 250, height: 88, title: "Data Aggregator", note: "M/M, Y/Y,\npacing calculations." }));
  elements.push(...box({ x: 410, y: 555, width: 250, height: 88, title: "Chart Renderer", note: "matplotlib -> PNG,\nstyled to brand palette." }));
  elements.push(...box({ x: 700, y: 555, width: 250, height: 88, title: "Channel Notes Generator", note: "Claude API, structured signals\n-> narrative." }));

  elements.push(...arrow({ x1: 535, y1: 467, x2: 245, y2: 555, label: "investment data", labelDy: -12 }));
  elements.push(...arrow({ x1: 535, y1: 467, x2: 535, y2: 555, label: "time-series data", labelDx: 86 }));
  elements.push(...arrow({ x1: 535, y1: 467, x2: 825, y2: 555, label: "event signals", labelDy: -12 }));

  elements.push(...box({ x: 270, y: 735, width: 530, height: 86, title: "Slide Assembler (python-pptx)" }));
  elements.push(...arrow({ x1: 245, y1: 643, x2: 400, y2: 735, label: "tables", labelDx: -40 }));
  elements.push(...arrow({ x1: 535, y1: 643, x2: 535, y2: 735, label: "chart PNGs", labelDx: 82 }));
  elements.push(...arrow({ x1: 825, y1: 643, x2: 670, y2: 735, label: "narrative text", labelDx: 42 }));

  elements.push(...box({ x: 335, y: 900, width: 400, height: 78, title: "Formatted .pptx Deck", fill: colors.io }));
  elements.push(...arrow({ x1: 535, y1: 821, x2: 535, y2: 900 }));

  elements.push(...box({ x: 930, y: 725, width: 300, height: 82, title: "Verification Harness", fill: colors.process }));
  elements.push(...box({ x: 980, y: 895, width: 220, height: 70, title: "Verification Report", fill: colors.meta }));
  elements.push(...arrow({ x1: 800, y1: 778, x2: 930, y2: 766, label: "generated values", labelDy: -22 }));
  elements.push(...arrow({ x1: 1080, y1: 807, x2: 1090, y2: 895 }));
  elements.push(...arrow({ x1: 460, y1: 276, x2: 930, y2: 744, dashed: true, label: "source-of-truth lookup", labelDx: 80, labelDy: -40 }));
  elements.push(...arrow({ x1: 900, y1: 276, x2: 1080, y2: 725, dashed: true, label: "source-of-truth lookup", labelDx: 78, labelDy: -50 }));

  elements.push(text({ x: 100, y: 1015, width: 980, text: "Legend: light blue = inputs / primary output, green = processing, yellow = verification meta-output, dashed gray = future/source lookup paths.", size: 13, color: colors.lightText, align: "left" }));
  return elements;
}

writeScene("project-1-timeline-generator.excalidraw", project1());
writeScene("project-2-reporting-automation.excalidraw", project2());
