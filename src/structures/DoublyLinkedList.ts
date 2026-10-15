import { ListNode } from "./ListNode";

export class DoublyLinkedList<T> implements Iterable<T> {
  private head: ListNode<T> | null = null;
  private tail: ListNode<T> | null = null;
  private length = 0;

  get size(): number {
    return this.length;
  }

  get first(): ListNode<T> | null {
    return this.head;
  }

  get last(): ListNode<T> | null {
    return this.tail;
  }

  isEmpty(): boolean {
    return this.length === 0;
  }

  addFirst(value: T): ListNode<T> {
    const node = new ListNode(value);
    this.linkFirst(node);
    return node;
  }

  addLast(value: T): ListNode<T> {
    const node = new ListNode(value);
    this.linkLast(node);
    return node;
  }

  insertAt(index: number, value: T): ListNode<T> {
    const node = new ListNode(value);
    this.linkAt(index, node);
    return node;
  }

  getNodeAt(index: number): ListNode<T> | null {
    if (index < 0 || index >= this.length) return null;
    if (index < this.length / 2) {
      let current = this.head;
      for (let i = 0; i < index; i++) current = current!.next;
      return current;
    }
    let current = this.tail;
    for (let i = this.length - 1; i > index; i--) current = current!.prev;
    return current;
  }

  getAt(index: number): T | null {
    return this.getNodeAt(index)?.value ?? null;
  }

  findNode(predicate: (value: T) => boolean): ListNode<T> | null {
    let current = this.head;
    while (current) {
      if (predicate(current.value)) return current;
      current = current.next;
    }
    return null;
  }

  indexOfNode(node: ListNode<T>): number {
    let current = this.head;
    let index = 0;
    while (current) {
      if (current === node) return index;
      current = current.next;
      index++;
    }
    return -1;
  }

  contains(node: ListNode<T>): boolean {
    return this.indexOfNode(node) !== -1;
  }

  removeNode(node: ListNode<T>): T {
    this.unlink(node);
    return node.value;
  }

  removeAt(index: number): T | null {
    const node = this.getNodeAt(index);
    return node ? this.removeNode(node) : null;
  }

  removeFirst(): T | null {
    return this.head ? this.removeNode(this.head) : null;
  }

  removeLast(): T | null {
    return this.tail ? this.removeNode(this.tail) : null;
  }

  moveNode(node: ListNode<T>, targetIndex: number): void {
    if (!this.contains(node)) throw new Error("Node does not belong to this list");
    const clamped = Math.max(0, Math.min(targetIndex, this.length - 1));
    if (this.indexOfNode(node) === clamped) return;
    this.unlink(node);
    this.linkAt(clamped, node);
  }

  clear(): void {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  toArray(): T[] {
    return [...this];
  }

  nodes(): ListNode<T>[] {
    const result: ListNode<T>[] = [];
    let current = this.head;
    while (current) {
      result.push(current);
      current = current.next;
    }
    return result;
  }

  reversed(): T[] {
    const result: T[] = [];
    let current = this.tail;
    while (current) {
      result.push(current.value);
      current = current.prev;
    }
    return result;
  }

  *[Symbol.iterator](): Iterator<T> {
    let current = this.head;
    while (current) {
      yield current.value;
      current = current.next;
    }
  }

  private linkFirst(node: ListNode<T>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    else this.tail = node;
    this.head = node;
    this.length++;
  }

  private linkLast(node: ListNode<T>): void {
    node.next = null;
    node.prev = this.tail;
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.length++;
  }

  private linkAt(index: number, node: ListNode<T>): void {
    if (index <= 0) return this.linkFirst(node);
    if (index >= this.length) return this.linkLast(node);
    const successor = this.getNodeAt(index)!;
    const predecessor = successor.prev!;
    node.prev = predecessor;
    node.next = successor;
    predecessor.next = node;
    successor.prev = node;
    this.length++;
  }

  private unlink(node: ListNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.next = null;
    node.prev = null;
    this.length--;
  }
}
