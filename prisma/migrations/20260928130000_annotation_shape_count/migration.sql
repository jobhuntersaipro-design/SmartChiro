-- AlterTable
ALTER TABLE "Annotation" ADD COLUMN     "shapeCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: shapes live at canvasState.shapes (AnnotationCanvasState).
UPDATE "Annotation" SET "shapeCount" = COALESCE(jsonb_array_length("canvasState"->'shapes'), 0) WHERE jsonb_typeof("canvasState"->'shapes') = 'array';
