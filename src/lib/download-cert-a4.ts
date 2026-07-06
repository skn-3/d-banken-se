import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// Renderar en A4-canvas (1240×1754) → PDF i A4-format (portrait, mm).
export async function downloadA4CertificateAsPdf(node: HTMLElement, verificationId: string) {
  const canvas = await html2canvas(node, {
    backgroundColor: null,
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    windowWidth: 1240,
    windowHeight: 1754,
  });
  const imgData = canvas.toDataURL("image/jpeg", 0.94);
  // A4: 210 × 297 mm
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.addImage(imgData, "JPEG", 0, 0, 210, 297, undefined, "FAST");
  pdf.save(`vardebevis-${verificationId}.pdf`);
}
