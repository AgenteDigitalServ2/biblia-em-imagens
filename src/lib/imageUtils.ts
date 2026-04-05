/**
 * Overlays Bible text, citation and a watermark onto a base64 image.
 */
export async function overlayTextOnImage(
  base64Image: string,
  text: string,
  citation: string,
  watermarkUrl?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Set canvas size to image size
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Add a dark gradient at the bottom for readability
      const gradientHeight = canvas.height * 0.45;
      const gradient = ctx.createLinearGradient(0, canvas.height - gradientHeight, 0, canvas.height);
      gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.6)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, canvas.height - gradientHeight, canvas.width, gradientHeight);

      // Text settings
      const padding = canvas.width * 0.1;
      const maxWidth = canvas.width - padding * 2;
      
      // Draw Verse Text
      const fontSize = canvas.width * 0.048; 
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `italic ${fontSize}px "Playfair Display", serif`;
      ctx.fillStyle = "white";
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 15;

      const lines = wrapText(ctx, `"${text}"`, maxWidth);
      const lineHeight = fontSize * 1.6;
      const totalTextHeight = lines.length * lineHeight;
      
      // Center text vertically in the bottom area
      let currentY = canvas.height - (gradientHeight / 2) - (totalTextHeight / 2);
      
      lines.forEach((line) => {
        ctx.fillText(line, canvas.width / 2, currentY + (lineHeight / 2));
        currentY += lineHeight;
      });

      // Draw Citation
      const citationFontSize = fontSize * 0.7;
      ctx.font = `bold ${citationFontSize}px "Cinzel", serif`;
      ctx.fillStyle = "#b8860b"; // Biblical Gold
      ctx.fillText(citation.toUpperCase(), canvas.width / 2, canvas.height - padding * 1.5);

      // Draw Watermark if provided
      if (watermarkUrl) {
        try {
          const watermarkImg = await loadImage(watermarkUrl);
          const watermarkSize = canvas.width * 0.25;
          const watermarkPadding = canvas.width * 0.05;
          
          ctx.globalAlpha = 0.8;
          ctx.drawImage(
            watermarkImg, 
            canvas.width - watermarkSize - watermarkPadding, 
            watermarkPadding, 
            watermarkSize, 
            watermarkSize
          );
          ctx.globalAlpha = 1.0;
        } catch (e) {
          console.warn("Could not load watermark image", e);
        }
      }

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = base64Image;
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}
