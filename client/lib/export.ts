import type { ProcessData, ProcessBlock, BlockType } from "@shared/types";

// ============================================
// Helper: download a Blob
// ============================================
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
// SVG Export  (vector, infinitely scalable)
// ============================================

/**
 * Download an SVG string as a .svg file.
 */
export function exportToSVG(svgString: string, filename: string = "process-diagram.svg"): void {
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

// ============================================
// PNG Export  (SVG → canvas at 5×)
// ============================================

/**
 * Convert an SVG string to a high-resolution PNG and trigger download.
 * Scale factor 5 gives crisp output even on large monitors / when zoomed in.
 */
export function exportToPNG(
  svgString: string,
  filename: string = "process-diagram.png",
): void {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
  const svgEl = svgDoc.documentElement;

  const w = parseFloat(svgEl.getAttribute("width") || "1200");
  const h = parseFloat(svgEl.getAttribute("height") || "800");
  const SCALE = 5;

  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * SCALE);
    canvas.height = Math.round(h * SCALE);
    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.scale(SCALE, SCALE);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);

    canvas.toBlob(
      (pngBlob) => { if (pngBlob) downloadBlob(pngBlob, filename); },
      "image/png",
    );
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

// ============================================
// PDF Export  (SVG → canvas → jsPDF)
// ============================================

/**
 * Export the diagram as a PDF using jsPDF.
 * Page orientation and size are fitted to the actual diagram dimensions.
 */
export async function exportToPDF(
  svgString: string,
  filename: string = "process-diagram.pdf",
  title: string = "Бизнес-процесс",
): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
  const svgEl = svgDoc.documentElement;

  const w = parseFloat(svgEl.getAttribute("width") || "1200");
  const h = parseFloat(svgEl.getAttribute("height") || "800");
  const SCALE = 3;

  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * SCALE);
      canvas.height = Math.round(h * SCALE);
      const ctx = canvas.getContext("2d", { alpha: false })!;
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.scale(SCALE, SCALE);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      const dataUrl = canvas.toDataURL("image/png");

      // PDF page dimensions in mm (fit to diagram aspect ratio, max A0-ish)
      const MAX_MM = 420; // A3 long side
      const MM_PER_PX = 0.264583;
      let pdfW = w * MM_PER_PX;
      let pdfH = h * MM_PER_PX;
      // Clamp to MAX_MM on the longer side while keeping ratio
      const longer = Math.max(pdfW, pdfH);
      if (longer > MAX_MM) {
        const ratio = MAX_MM / longer;
        pdfW *= ratio;
        pdfH *= ratio;
      }

      const orientation = pdfW >= pdfH ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: [pdfW, pdfH],
      });

      pdf.addImage(dataUrl, "PNG", 0, 0, pdfW, pdfH);
      pdf.save(filename);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG for PDF export"));
    };
    img.src = url;
  });
}

// ============================================
// BPMN 2.0 XML Export  (unchanged)
// ============================================

const BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI";
const DC_NS = "http://www.omg.org/spec/DD/20100524/DC";
const DI_NS = "http://www.omg.org/spec/DD/20100524/DI";

function bpmnElementType(type: BlockType): string {
  switch (type) {
    case "start":    return "startEvent";
    case "end":      return "endEvent";
    case "action":   return "task";
    case "product":  return "task";
    case "decision": return "exclusiveGateway";
    case "split":    return "parallelGateway";
    default:         return "task";
  }
}

export function exportToBPMN(data: ProcessData, filename: string = "process.bpmn"): void {
  const xml = generateBPMNXml(data);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

function generateBPMNXml(data: ProcessData): string {
  const lines: string[] = [];
  const indent = (level: number) => "  ".repeat(level);

  const blocksByRole = new Map<string, ProcessBlock[]>();
  for (const block of data.blocks) {
    const roleBlocks = blocksByRole.get(block.role) || [];
    roleBlocks.push(block);
    blocksByRole.set(block.role, roleBlocks);
  }

  const roleProcessIds = new Map<string, string>();
  const roleParticipantIds = new Map<string, string>();
  data.roles.forEach((role, idx) => {
    roleProcessIds.set(role.name, `Process_${idx + 1}`);
    roleParticipantIds.set(role.name, `Participant_${idx + 1}`);
  });

  interface SeqFlow { id: string; sourceRef: string; targetRef: string; name?: string; }
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

  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<bpmn:definitions xmlns:bpmn="${BPMN_NS}" xmlns:bpmndi="${BPMNDI_NS}" xmlns:dc="${DC_NS}" xmlns:di="${DI_NS}" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="BusinessProcessBuilder" exporterVersion="1.0">`
  );

  lines.push(`${indent(1)}<bpmn:collaboration id="Collaboration_1">`);
  for (const role of data.roles) {
    const pid = roleParticipantIds.get(role.name) || "";
    const processId = roleProcessIds.get(role.name) || "";
    lines.push(
      `${indent(2)}<bpmn:participant id="${pid}" name="${escapeXml(role.name)}" processRef="${processId}" />`
    );
  }
  lines.push(`${indent(1)}</bpmn:collaboration>`);

  for (const role of data.roles) {
    const processId = roleProcessIds.get(role.name) || "";
    const roleBlocks = blocksByRole.get(role.name) || [];
    lines.push(`${indent(1)}<bpmn:process id="${processId}" name="${escapeXml(role.name)}" isExecutable="false">`);
    for (const block of roleBlocks) {
      const elemType = bpmnElementType(block.type);
      lines.push(`${indent(2)}<bpmn:${elemType} id="${block.id}" name="${escapeXml(block.name)}">`);
      if (block.description) {
        lines.push(`${indent(3)}<bpmn:documentation>${escapeXml(block.description)}</bpmn:documentation>`);
      }
      const incoming = sequenceFlows.filter((f) => f.targetRef === block.id);
      for (const flow of incoming) lines.push(`${indent(3)}<bpmn:incoming>${flow.id}</bpmn:incoming>`);
      const outgoing = sequenceFlows.filter((f) => f.sourceRef === block.id);
      for (const flow of outgoing) lines.push(`${indent(3)}<bpmn:outgoing>${flow.id}</bpmn:outgoing>`);
      lines.push(`${indent(2)}</bpmn:${elemType}>`);
    }
    const roleFlows = sequenceFlows.filter((f) => roleBlocks.some((b) => b.id === f.sourceRef));
    for (const flow of roleFlows) {
      const nameAttr = flow.name ? ` name="${escapeXml(flow.name)}"` : "";
      lines.push(`${indent(2)}<bpmn:sequenceFlow id="${flow.id}" sourceRef="${flow.sourceRef}" targetRef="${flow.targetRef}"${nameAttr} />`);
    }
    lines.push(`${indent(1)}</bpmn:process>`);
  }

  lines.push(`${indent(1)}<bpmndi:BPMNDiagram id="BPMNDiagram_1">`);
  lines.push(`${indent(2)}<bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">`);

  let laneY = 0;
  const LANE_HEIGHT = 200;
  const LANE_WIDTH = 1200;
  for (const role of data.roles) {
    const pid = roleParticipantIds.get(role.name) || "";
    lines.push(`${indent(3)}<bpmndi:BPMNShape id="${pid}_di" bpmnElement="${pid}" isHorizontal="true">`);
    lines.push(`${indent(4)}<dc:Bounds x="160" y="${laneY}" width="${LANE_WIDTH}" height="${LANE_HEIGHT}" />`);
    lines.push(`${indent(3)}</bpmndi:BPMNShape>`);
    laneY += LANE_HEIGHT;
  }

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
      lines.push(`${indent(3)}<bpmndi:BPMNShape id="${block.id}_di" bpmnElement="${block.id}">`);
      lines.push(`${indent(4)}<dc:Bounds x="${blockX}" y="${blockY}" width="${w}" height="${h}" />`);
      lines.push(`${indent(3)}</bpmndi:BPMNShape>`);
      blockX += w + 80;
    }
    roleIndex++;
  }

  for (const flow of sequenceFlows) {
    const src = blockPositions.get(flow.sourceRef);
    const tgt = blockPositions.get(flow.targetRef);
    if (src && tgt) {
      const srcCX = src.x + src.w;
      const srcCY = src.y + src.h / 2;
      const tgtCX = tgt.x;
      const tgtCY = tgt.y + tgt.h / 2;
      lines.push(`${indent(3)}<bpmndi:BPMNEdge id="${flow.id}_di" bpmnElement="${flow.id}">`);
      lines.push(`${indent(4)}<di:waypoint x="${srcCX}" y="${srcCY}" />`);
      if (Math.abs(srcCY - tgtCY) > 10) {
        const midX = (srcCX + tgtCX) / 2;
        lines.push(`${indent(4)}<di:waypoint x="${midX}" y="${srcCY}" />`);
        lines.push(`${indent(4)}<di:waypoint x="${midX}" y="${tgtCY}" />`);
      }
      lines.push(`${indent(4)}<di:waypoint x="${tgtCX}" y="${tgtCY}" />`);
      lines.push(`${indent(3)}</bpmndi:BPMNEdge>`);
    }
  }

  lines.push(`${indent(2)}</bpmndi:BPMNPlane>`);
  lines.push(`${indent(1)}</bpmndi:BPMNDiagram>`);
  lines.push(`</bpmn:definitions>`);

  return lines.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function getBPMNXmlString(data: ProcessData): string {
  return generateBPMNXml(data);
}
