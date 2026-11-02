export function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = 8) {
    let line = ''; let count = 0;
    for (const word of String(text).split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (context.measureText(next).width > maxWidth && line) { context.fillText(line, x, y); line = word; y += lineHeight; count++; if (count >= maxLines) return; } else line = next; }
    if (line) context.fillText(line, x, y);
  }
export function boardElementBounds(element, width, height) {
    if (element.type === 'path') { const xs = element.points.map((p) => p.x * width); const ys = element.points.map((p) => p.y * height); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
    if (element.type === 'text') return { x: element.x * width, y: element.y * height - (element.fontSize || 20), w: Math.max(40, String(element.text).length * (element.fontSize || 20) * .58), h: String(element.text).split('\n').length * (element.fontSize || 20) * 1.4 };
    if (element.type === 'sticky') return { x: element.x * width, y: element.y * height, w: element.w * width, h: element.h * height };
    const x1 = element.x1 * width; const y1 = element.y1 * height; const x2 = element.x2 * width; const y2 = element.y2 * height;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
export function hitBoardElement(board, x, y, width, height) {
    for (let i = board.elements.length - 1; i >= 0; i--) {
      const element = board.elements[i]; const tolerance = Math.max(10, (element.width || 3) + 6);
      if (element.type === 'path') {
        const points = element.points || [];
        for (let j = 1; j < points.length; j++) if (distanceToSegment(x, y, points[j - 1].x * width, points[j - 1].y * height, points[j].x * width, points[j].y * height) <= tolerance) return element;
        if (points.length === 1 && Math.hypot(x - points[0].x * width, y - points[0].y * height) <= tolerance) return element;
      } else if (element.type === 'line' || element.type === 'arrow') {
        if (distanceToSegment(x, y, element.x1 * width, element.y1 * height, element.x2 * width, element.y2 * height) <= tolerance) return element;
      } else { const box = boardElementBounds(element, width, height); if (x >= box.x - tolerance && x <= box.x + box.w + tolerance && y >= box.y - tolerance && y <= box.y + box.h + tolerance) return element; }
    }
    return null;
  }
export function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1; const dy = y2 - y1; const length = dx * dx + dy * dy; const t = length ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
export function moveBoardElement(element, dx, dy) {
    if (element.type === 'path') element.points = element.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
    else if (element.type === 'text' || element.type === 'sticky') { element.x += dx; element.y += dy; }
    else { element.x1 += dx; element.x2 += dx; element.y1 += dy; element.y2 += dy; }
  }
