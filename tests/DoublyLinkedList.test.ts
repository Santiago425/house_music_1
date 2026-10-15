import { describe, expect, it } from "vitest";
import { DoublyLinkedList } from "../src/structures/DoublyLinkedList";

const build = (...values: string[]) => {
  const list = new DoublyLinkedList<string>();
  values.forEach((value) => list.addLast(value));
  return list;
};

const assertLinks = (list: DoublyLinkedList<string>) => {
  expect(list.reversed()).toEqual([...list.toArray()].reverse());
  expect(list.first?.prev ?? null).toBeNull();
  expect(list.last?.next ?? null).toBeNull();
};

describe("DoublyLinkedList", () => {
  it("adds at the start, end and any position", () => {
    const list = build("b", "d");
    list.addFirst("a");
    list.addLast("e");
    list.insertAt(2, "c");
    expect(list.toArray()).toEqual(["a", "b", "c", "d", "e"]);
    expect(list.size).toBe(5);
    assertLinks(list);
  });

  it("clamps out of range insertions", () => {
    const list = build("b");
    list.insertAt(-4, "a");
    list.insertAt(99, "c");
    expect(list.toArray()).toEqual(["a", "b", "c"]);
    assertLinks(list);
  });

  it("removes head, tail and middle nodes", () => {
    const list = build("a", "b", "c", "d");
    expect(list.removeFirst()).toBe("a");
    expect(list.removeLast()).toBe("d");
    expect(list.removeAt(0)).toBe("b");
    expect(list.toArray()).toEqual(["c"]);
    expect(list.removeAt(0)).toBe("c");
    expect(list.isEmpty()).toBe(true);
    expect(list.first).toBeNull();
    expect(list.last).toBeNull();
  });

  it("moves the same node instance to a new position", () => {
    const list = build("a", "b", "c", "d");
    const node = list.getNodeAt(0)!;
    list.moveNode(node, 3);
    expect(list.toArray()).toEqual(["b", "c", "d", "a"]);
    expect(list.getNodeAt(3)).toBe(node);
    list.moveNode(node, 1);
    expect(list.toArray()).toEqual(["b", "a", "c", "d"]);
    assertLinks(list);
  });

  it("finds nodes from both ends", () => {
    const list = build("a", "b", "c", "d", "e");
    expect(list.getAt(1)).toBe("b");
    expect(list.getAt(4)).toBe("e");
    expect(list.getAt(5)).toBeNull();
  });
});
