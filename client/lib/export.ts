import type { ProcessData, ProcessBlock, BlockType } from "@shared/types";

// ============================================
// Export Utilities for Business Process Builder
// ============================================

/**
 * Helper: create a download link from a Blob and trigger download.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================
// PNG Export
// ============================================

/**
 * Export a canvas element as a PNG file.
 * Accepts either a <canvas> directly or a container element that holds an
 * SVG / canvas child (uses the first <canvas> found).
 */
export function exportToPNG(
  canvasOrContainer: HTMLCanvasElement | HTMLElement,
  filename: string = "process-diagram.png"
): void {
  let canvas: HTMLCanvasElement;

  if (canvasOrContainer instanceof HTMLCanvasElement) {
    canvas = canvasOrContainer;
  } else {
    const found = canvasOrContainer.querySelector("canvas");
    if (!found) {
      // Fallback: render the container DOM to a canvas via html2canvas-like approach
      exportDOMToPNG(canvasOrContainer, filename);
      return;
    }
    canvas = found;
  }

  canvas.toBlob(
    (blob) => {
      if (blob) {
        downloadBlob(blob, filename);
      }
    },
    "image/png",
    1.0
  );
}

/**
 * Fallback DOM-to-PNG export using SVG foreignObject technique.
 * Works for DOM-based diagrams that don't use a <canvas>.
 */
function exportDOMToPNG(element: HTMLElement, filename: string): void {
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);

  // Clone the element to avoid mutations
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("width", String(width * 2));
  svg.setAttribute("height", String(height * 2));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const foreignObject = document.createElementNS(svgNS, "foreignObject");
  foreignObject.setAttribute("width", "100%");
  foreignObject.setAttribute("height", "100%");

  const body = document.createElement("div");
  body.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  body.style.width = `${width}px`;
  body.style.height = `${height}px`;

  // Copy computed styles inline
  const styles = document.querySelectorAll("style, link[rel='stylesheet']");
  const styleContent: string[] = [];
  styles.forEach((s) => {
    if (s instanceof HTMLStyleElement) {
      styleContent.push(s.outerHTML);
    }
  });

  body.innerHTML = styleContent.join("") + clone.outerHTML;
  foreignObject.appendChild(body);
  svg.appendChild(foreignObject);

  const svgString = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            downloadBlob(blob, filename);
          }
        },
        "image/png",
        1.0
      );
    }
    URL.revokeObjectURL(svgUrl);
  };
  img.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    console.error("Failed to export diagram as PNG");
  };
  img.src = svgUrl;
}

// ============================================
// BPMN 2.0 XML Export
// ============================================

const BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI";
const DC_NS = "http://www.omg.org/spec/DD/20100524/DC";
const DI_NS = "http://www.omg.org/spec/DD/20100524/DI";

/**
 * Map BlockType to BPMN element type.
 */
function bpmnElementType(type: BlockType): string {
  switch (type) {
    case "start":
      return "startEvent";
    case "end":
      return "endEvent";
    case "action":
      return "task";
    case "product":
      return "task";
    case "decision":
      return "exclusiveGateway";
    case "split":
      return "parallelGateway";
    default:
      return "task";
  }
}

/**
 * Generate BPMN 2.0 XML from ProcessData and trigger download.
 */
export function exportToBPMN(
  data: ProcessData,
  filename: string = "process.bpmn"
): void {
  const xml = generateBPMNXml(data);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

/**
 * Generate the actual BPMN 2.0 XML string.
 */
function generateBPMNXml(data: ProcessData): string {
  const lines: string[] = [];
  const indent = (level: number) => "  ".repeat(level);

  // Group blocks by role
  const blocksByRole = new Map<string, ProcessBlock[]>();
  for (const block of data.blocks) {
    const roleBlocks = blocksByRole.get(block.role) || [];
    roleBlocks.push(block);
    blocksByRole.set(block.role, roleBlocks);
  }

  // Build role-to-id mapping
  const roleProcessIds = new Map<string, string>();
  const roleParticipantIds = new Map<string, string>();
  data.roles.forEach((role, idx) => {
    roleProcessIds.set(role.name, `Process_${idx + 1}`);
    roleParticipantIds.set(role.name, `Participant_${idx + 1}`);
  });

  // Collect all sequence flows
  interface SeqFlow {
    id: string;
    sourceRef: string;
    targetRef: string;
    name?: string;
  }
  const sequenceFlows: SeqFlow[] = [];
  let flowCounter = 0;
  for (const block of data.blocks) {
    for (const connId of block.connections) {
      flowCounter++;
      const connBlock = data.blocks.find((b) => b.id === connId);
      sequenceFlows.push({
        id: `Flow_${flowCounter}`,
        sourceRef: block.id,
        targetRef: connId,
        name: block.type === "decision" ? (connBlock?.conditionLabel || undefined) : undefined,
      });
    }
  }

  // XML Header
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<bpmn:definitions xmlns:bpmn="${BPMN_NS}" xmlns:bpmndi="${BPMNDI_NS}" xmlns:dc="${DC_NS}" xmlns:di="${DI_NS}" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="BusinessProcessBuilder" exporterVersion="1.0">`
  );

  // Collaboration
  lines.push(`${indent(1)}<bpmn:collaboration id="Collaboration_1">`);
  for (const role of data.roles) {
    const pid = roleParticipantIds.get(role.name) || "";
    const processId = roleProcessIds.get(role.name) || "";
    lines.push(
      `${indent(2)}<bpmn:participant id="${pid}" name="${escapeXml(role.name)}" processRef="${processId}" />`
    );
  }
  lines.push(`${indent(1)}</bpmn:collaboration>`);

  // Processes (one per role)
  for (const role of data.roles) {
    const processId = roleProcessIds.get(role.name) || "";
    const roleBlocks = blocksByRole.get(role.name) || [];

    lines.push(
      `${indent(1)}<bpmn:process id="${processId}" name="${escapeXml(role.name)}" isExecutable="false">`
    );

    // Elements
    for (const block of roleBlocks) {
      const elemType = bpmnElementType(block.type);
      lines.push(
        `${indent(2)}<bpmn:${elemType} id="${block.id}" name="${escapeXml(block.name)}">`
      );
      if (block.description) {
        lines.push(
          `${indent(3)}<bpmn:documentation>${escapeXml(block.description)}</bpmn:documentation>`
        );
      }
      // Incoming flows
      const incoming = sequenceFlows.filter((f) => f.targetRef === block.id);
      for (const flow of incoming) {
        lines.push(`${indent(3)}<bpmn:incoming>${flow.id}</bpmn:incoming>`);
      }
      // Outgoing flows
      const outgoing = sequenceFlows.filter((f) => f.sourceRef === block.id);
      for (const flow of outgoing) {
        lines.push(`${indent(3)}<bpmn:outgoing>${flow.id}</bpmn:outgoing>`);
      }
      lines.push(`${indent(2)}</bpmn:${elemType}>`);
    }

    // Sequence flows for this role (flows where source is in this role)
    const roleFlows = sequenceFlows.filter((f) =>
      roleBlocks.some((b) => b.id === f.sourceRef)
    );
    for (const flow of roleFlows) {
      const nameAttr = flow.name ? ` name="${escapeXml(flow.name)}"` : "";
      lines.push(
        `${indent(2)}<bpmn:sequenceFlow id="${flow.id}" sourceRef="${flow.sourceRef}" targetRef="${flow.targetRef}"${nameAttr} />`
      );
    }

    lines.push(`${indent(1)}</bpmn:process>`);
  }

  // BPMN Diagram
  lines.push(`${indent(1)}<bpmndi:BPMNDiagram id="BPMNDiagram_1">`);
  lines.push(`${indent(2)}<bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">`);

  // Participant shapes (swimlane bands)
  let laneY = 0;
  const LANE_HEIGHT = 200;
  const LANE_WIDTH = 1200;
  for (const role of data.roles) {
    const pid = roleParticipantIds.get(role.name) || "";
    lines.push(`${indent(3)}<bpmndi:BPMNShape id="${pid}_di" bpmnElement="${pid}" isHorizontal="true">`);
    lines.push(
      `${indent(4)}<dc:Bounds x="160" y="${laneY}" width="${LANE_WIDTH}" height="${LANE_HEIGHT}" />`
    );
    lines.push(`${indent(3)}</bpmndi:BPMNShape>`);
    laneY += LANE_HEIGHT;
  }

  // Element shapes
  const blockPositions = new Map<string, { x: number; y: number; w: number; h: number }>();
  let roleIndex = 0;
  for (const role of data.roles) {
    const roleBlocks = blocksByRole.get(role.name) || [];
    let blockX = 250;
    const blockY = roleIndex * LANE_HEIGHT + 60;

    for (const block of roleBlocks) {
      const isGateway = block.type === "decision" || block.type === "split";
      const isEvent = block.type === "start" || block.type === "end";
      const w = isEvent ? 36 : isGateway ? 50 : 100;
      const h = isEvent ? 36 : isGateway ? 50 : 80;

      blockPositions.set(block.id, { x: blockX, y: blockY, w, h });

      lines.push(
        `${indent(3)}<bpmndi:BPMNShape id="${block.id}_di" bpmnElement="${block.id}">`
      );
      lines.push(
        `${indent(4)}<dc:Bounds x="${blockX}" y="${blockY}" width="${w}" height="${h}" />`
      );
      lines.push(`${indent(3)}</bpmndi:BPMNShape>`);

      blockX += w + 80;
    }
    roleIndex++;
  }

  // Sequence flow edges
  for (const flow of sequenceFlows) {
    const src = blockPositions.get(flow.sourceRef);
    const tgt = blockPositions.get(flow.targetRef);
    if (src && tgt) {
      const srcCenterX = src.x + src.w;
      const srcCenterY = src.y + src.h / 2;
      const tgtCenterX = tgt.x;
      const tgtCenterY = tgt.y + tgt.h / 2;

      lines.push(
        `${indent(3)}<bpmndi:BPMNEdge id="${flow.id}_di" bpmnElement="${flow.id}">`
      );
      lines.push(
        `${indent(4)}<di:waypoint x="${srcCenterX}" y="${srcCenterY}" />`
      );
      // If cross-lane, add intermediate waypoints
      if (Math.abs(srcCenterY - tgtCenterY) > 10) {
        const midX = (srcCenterX + tgtCenterX) / 2;
        lines.push(
          `${indent(4)}<di:waypoint x="${midX}" y="${srcCenterY}" />`
        );
        lines.push(
          `${indent(4)}<di:waypoint x="${midX}" y="${tgtCenterY}" />`
        );
      }
      lines.push(
        `${indent(4)}<di:waypoint x="${tgtCenterX}" y="${tgtCenterY}" />`
      );
      lines.push(`${indent(3)}</bpmndi:BPMNEdge>`);
    }
  }

  lines.push(`${indent(2)}</bpmndi:BPMNPlane>`);
  lines.push(`${indent(1)}</bpmndi:BPMNDiagram>`);
  lines.push(`</bpmn:definitions>`);

  return lines.join("\n");
}

/**
 * Escape special XML characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================
// PDF Export
// ============================================

/**
 * Export the diagram to PDF.
 * Uses a print-based approach: opens a new window with the canvas image and
 * triggers the browser print dialog (which allows saving as PDF).
 */
export function exportToPDF(
  canvasOrContainer: HTMLCanvasElement | HTMLElement,
  filename: string = "process-diagram.pdf",
  title: string = "Бизнес-процесс"
): void {
  let imageDataUrl: string;

  if (canvasOrContainer instanceof HTMLCanvasElement) {
    imageDataUrl = canvasOrContainer.toDataURL("image/png", 1.0);
    openPrintWindow(imageDataUrl, title);
  } else {
    const canvas = canvasOrContainer.querySelector("canvas");
    if (canvas) {
      imageDataUrl = canvas.toDataURL("image/png", 1.0);
      openPrintWindow(imageDataUrl, title);
    } else {
      // DOM-based fallback: capture via the same SVG approach
      captureElementToDataUrl(canvasOrContainer).then((dataUrl) => {
        if (dataUrl) {
          openPrintWindow(dataUrl, title);
        }
      });
    }
  }
}

/**
 * Open a print window with the given image data URL.
 */
function openPrintWindow(imageDataUrl: string, title: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    console.error("Could not open print window. Please allow popups.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeXml(title)}</title>
      <style>
        @page {
          size: landscape;
          margin: 10mm;
        }
        body {
          margin: 0;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        h1 {
          font-size: 18px;
          color: #1f2937;
          margin: 0 0 16px 0;
          padding-bottom: 8px;
          border-bottom: 2px solid #7c3aed;
        }
        .meta {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 16px;
        }
        img {
          max-width: 100%;
          height: auto;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
        }
        @media print {
          body { padding: 0; }
          h1 { font-size: 14px; margin-bottom: 8px; }
          .meta { margin-bottom: 8px; }
        }
      </style>
    </head>
    <body>
      <h1>${escapeXml(title)}</h1>
      <div class="meta">Экспортировано: ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
      <img src="${imageDataUrl}" alt="Диаграмма процесса" />
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 300);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Capture a DOM element to a data URL via offscreen canvas.
 */
function captureElementToDataUrl(element: HTMLElement): Promise<string | null> {
  return new Promise((resolve) => {
    const rect = element.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);

    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("xmlns", svgNS);
    svg.setAttribute("width", String(width * 2));
    svg.setAttribute("height", String(height * 2));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const foreignObject = document.createElementNS(svgNS, "foreignObject");
    foreignObject.setAttribute("width", "100%");
    foreignObject.setAttribute("height", "100%");

    const body = document.createElement("div");
    body.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    body.style.width = `${width}px`;
    body.style.height = `${height}px`;
    body.innerHTML = clone.outerHTML;
    foreignObject.appendChild(body);
    svg.appendChild(foreignObject);

    const svgString = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png", 1.0));
      } else {
        resolve(null);
      }
      URL.revokeObjectURL(svgUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      resolve(null);
    };
    img.src = svgUrl;
  });
}

// ============================================
// BPMN XML as string (for preview / clipboard)
// ============================================

/**
 * Return the BPMN XML string without downloading.
 */
export function getBPMNXmlString(data: ProcessData): string {
  return generateBPMNXml(data);
}
