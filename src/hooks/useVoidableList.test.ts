import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVoidableList } from "./useVoidableList";

interface Item {
  id: string;
}

function setup(overrides: Partial<Parameters<typeof useVoidableList<Item>>[0]> = {}) {
  const listVoided = vi.fn().mockResolvedValue([{ id: "v1" }]);
  const voidItem = vi.fn().mockResolvedValue(undefined);
  const restoreItem = vi.fn().mockResolvedValue(undefined);
  const onChanged = vi.fn();
  const onRemoved = vi.fn();
  const rendered = renderHook(
    (props: { scopeKey: string }) =>
      useVoidableList<Item>({
        scopeKey: props.scopeKey,
        listVoided,
        voidItem,
        restoreItem,
        onChanged,
        onRemoved,
        ...overrides,
      }),
    { initialProps: { scopeKey: "activity-1" } }
  );
  return { ...rendered, listVoided, voidItem, restoreItem, onChanged, onRemoved };
}

describe("useVoidableList", () => {
  it("starts with nothing pending and no removed items loaded", () => {
    const { result } = setup();
    expect(result.current.removingId).toBeNull();
    expect(result.current.reason).toBe("");
    expect(result.current.showRemoved).toBe(false);
    expect(result.current.voided).toEqual([]);
  });

  it("startRemove sets the pending id and clears any leftover reason text", async () => {
    const { result } = setup();
    act(() => result.current.setReason("leftover"));
    act(() => result.current.startRemove("item-1"));
    expect(result.current.removingId).toBe("item-1");
    expect(result.current.reason).toBe("");
  });

  it("cancelRemove clears the pending id without calling voidItem", async () => {
    const { result, voidItem } = setup();
    act(() => result.current.startRemove("item-1"));
    act(() => result.current.cancelRemove());
    expect(result.current.removingId).toBeNull();
    expect(voidItem).not.toHaveBeenCalled();
  });

  it("confirmRemove voids the pending item with a trimmed reason, clears it, and reports it removed", async () => {
    const { result, voidItem, onChanged, onRemoved } = setup();
    act(() => result.current.startRemove("item-1"));
    act(() => result.current.setReason("  duplicate entry  "));
    await act(() => result.current.confirmRemove());

    expect(voidItem).toHaveBeenCalledWith("item-1", "duplicate entry");
    expect(onRemoved).toHaveBeenCalledWith("item-1");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.removingId).toBeNull();
  });

  it("confirmRemove sends null for an empty reason rather than an empty string", async () => {
    const { result, voidItem } = setup();
    act(() => result.current.startRemove("item-1"));
    await act(() => result.current.confirmRemove());
    expect(voidItem).toHaveBeenCalledWith("item-1", null);
  });

  it("confirmRemove does nothing if nothing is pending", async () => {
    const { result, voidItem, onChanged } = setup();
    await act(() => result.current.confirmRemove());
    expect(voidItem).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("confirmRemove refreshes the removed list only when it's currently shown", async () => {
    const { result, listVoided } = setup();
    act(() => result.current.startRemove("item-1"));
    await act(() => result.current.confirmRemove());
    expect(listVoided).not.toHaveBeenCalled();

    await act(() => result.current.toggleShowRemoved()); // now showing
    listVoided.mockClear();
    act(() => result.current.startRemove("item-2"));
    await act(() => result.current.confirmRemove());
    expect(listVoided).toHaveBeenCalledTimes(1);
  });

  it("toggleShowRemoved loads the removed list on the way in", async () => {
    const { result, listVoided } = setup();
    await act(() => result.current.toggleShowRemoved());
    expect(result.current.showRemoved).toBe(true);
    expect(result.current.voided).toEqual([{ id: "v1" }]);
    expect(listVoided).toHaveBeenCalledTimes(1);
  });

  it("toggleShowRemoved back off doesn't reload", async () => {
    const { result, listVoided } = setup();
    await act(() => result.current.toggleShowRemoved());
    listVoided.mockClear();
    await act(() => result.current.toggleShowRemoved());
    expect(result.current.showRemoved).toBe(false);
    expect(listVoided).not.toHaveBeenCalled();
  });

  it("a failed listVoided leaves the removed list empty instead of throwing", async () => {
    const listVoided = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = setup({ listVoided });
    await act(() => result.current.toggleShowRemoved());
    expect(result.current.voided).toEqual([]);
  });

  it("restore calls restoreItem, reports changed, and reloads the removed list", async () => {
    const { result, restoreItem, onChanged, listVoided } = setup();
    await act(() => result.current.restore("v1"));
    expect(restoreItem).toHaveBeenCalledWith("v1");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(listVoided).toHaveBeenCalledTimes(1);
  });

  it("changing scopeKey resets pending removal, hides removed, and clears the removed list", async () => {
    const { result, rerender } = setup();
    act(() => result.current.startRemove("item-1"));
    await act(() => result.current.toggleShowRemoved());
    expect(result.current.removingId).toBe("item-1");
    expect(result.current.showRemoved).toBe(true);

    rerender({ scopeKey: "activity-2" });

    expect(result.current.removingId).toBeNull();
    expect(result.current.showRemoved).toBe(false);
    expect(result.current.voided).toEqual([]);
  });

  it("handlers read the latest callbacks even without re-render (stale-closure guard)", async () => {
    const voidItemA = vi.fn().mockResolvedValue(undefined);
    const voidItemB = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      (props: { voidItem: typeof voidItemA }) =>
        useVoidableList<Item>({
          scopeKey: "s",
          listVoided: () => Promise.resolve([]),
          voidItem: props.voidItem,
          restoreItem: () => Promise.resolve(undefined),
          onChanged: () => {},
        }),
      { initialProps: { voidItem: voidItemA } }
    );
    rerender({ voidItem: voidItemB });
    act(() => result.current.startRemove("item-1"));
    await act(() => result.current.confirmRemove());
    expect(voidItemA).not.toHaveBeenCalled();
    expect(voidItemB).toHaveBeenCalledWith("item-1", null);
  });
});
