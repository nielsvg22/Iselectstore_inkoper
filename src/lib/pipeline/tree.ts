import type { SearchRule } from "@prisma/client";
import { prisma } from "../db/client";
import { groupSchema, isGroup, type Condition, type Group, type Node } from "../engines/filters";

/** Bouwt de AND/OR-boom uit relationele SearchRule-rijen. */
export function buildTree(rows: SearchRule[]): Group {
  const byParent = new Map<string | null, SearchRule[]>();
  for (const r of rows) {
    const arr = byParent.get(r.parentId) ?? [];
    arr.push(r);
    byParent.set(r.parentId, arr);
  }
  const make = (r: SearchRule): Node =>
    r.kind === "GROUP"
      ? { op: (r.op as "AND" | "OR") ?? "AND", children: (byParent.get(r.id) ?? []).sort((a, b) => a.position - b.position).map(make) }
      : ({ field: r.field!, operator: r.operator as Condition["operator"], value: r.value as unknown } as Condition);
  const root = (byParent.get(null) ?? []).find((r) => r.kind === "GROUP");
  if (!root) return { op: "AND", children: [] };
  return make(root) as Group;
}

export async function loadTree(profileId: string): Promise<Group> {
  const rows = await prisma.searchRule.findMany({ where: { profileId } });
  return buildTree(rows);
}

/** Vervangt de volledige regelboom van een profiel (gevalideerd). */
export async function saveTree(profileId: string, tree: unknown): Promise<Group> {
  const g = groupSchema.parse(tree);
  await prisma.$transaction(async (tx) => {
    await tx.searchRule.deleteMany({ where: { profileId } });
    const insert = async (n: Node, parentId: string | null, position: number): Promise<void> => {
      if (isGroup(n)) {
        const row = await tx.searchRule.create({ data: { profileId, parentId, kind: "GROUP", op: n.op, position } });
        let i = 0;
        for (const c of n.children) await insert(c, row.id, i++);
      } else {
        await tx.searchRule.create({ data: { profileId, parentId, kind: "CONDITION", field: n.field, operator: n.operator, value: (n.value ?? null) as never, position } });
      }
    };
    await insert(g, null, 0);
  });
  return g;
}
