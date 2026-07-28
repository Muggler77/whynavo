import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export type SortableHomeShortcutItem = {
  id: string;
  label: string;
  content: ReactNode;
};

function SortableHomeShortcut({ item, language }: { item: SortableHomeShortcutItem; language: "zh-CN" | "en-US" }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver
  } = useSortable({ id: item.id });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={[
        "home-shortcut",
        isDragging ? "is-dragging" : "",
        isOver && !isDragging ? "is-drop-target" : ""
      ].filter(Boolean).join(" ")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined
      }}
      aria-label={language === "en-US" ? `Drag ${item.label}` : `拖动${item.label}`}
      title={language === "en-US" ? `Drag ${item.label}` : `拖动${item.label}`}
      {...attributes}
      {...listeners}
    >
      {item.content}
      <span className="tile-drag-handle" aria-hidden="true">
        <GripVertical size={14} />
      </span>
    </button>
  );
}

export default function SortableHomeShortcutGrid({
  items,
  iconSize,
  language,
  onMove
}: {
  items: SortableHomeShortcutItem[];
  iconSize: number;
  language: "zh-CN" | "en-US";
  onMove: (source: string, target: string) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const finishDrag = (event: DragEndEvent) => {
    const source = String(event.active.id);
    const target = event.over ? String(event.over.id) : "";
    if (target && source !== target) onMove(source, target);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishDrag}>
      <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
        <section className="home-shortcuts layout-editing" aria-label={language === "en-US" ? "Home shortcuts" : "主页快捷入口"}>
          <div
            className="home-shortcuts-row"
            style={{ "--icon": `${Math.max(48, Math.min(iconSize, 80))}px` } as CSSProperties}
          >
            {items.map((item) => <SortableHomeShortcut item={item} language={language} key={item.id} />)}
          </div>
        </section>
      </SortableContext>
    </DndContext>
  );
}
