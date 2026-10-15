import { describe, expect, it } from "vitest";
import { Playlist } from "../src/models/Playlist";
import { Song } from "../src/models/Song";

const song = (id: string) =>
  new Song({ id, title: id, artist: "Test", duration: 60, fileName: `${id}.mp3`, addedAt: 0 }, new Blob());

const build = (...ids: string[]) => {
  const playlist = new Playlist("p", "Test");
  ids.forEach((id) => playlist.addLast(song(id)));
  return playlist;
};

describe("Playlist", () => {
  it("navigates forward and backward", () => {
    const playlist = build("1", "2", "3");
    playlist.selectFirst();
    expect(playlist.next(false)?.id).toBe("2");
    expect(playlist.next(false)?.id).toBe("3");
    expect(playlist.next(false)).toBeNull();
    expect(playlist.current?.id).toBe("3");
    expect(playlist.previous(false)?.id).toBe("2");
  });

  it("loops when repeat all is enabled", () => {
    const playlist = build("1", "2");
    playlist.select("2");
    expect(playlist.next(true)?.id).toBe("1");
    expect(playlist.previous(true)?.id).toBe("2");
  });

  it("keeps the playing song after drag and drop and follows the new order", () => {
    const playlist = build("1", "2", "3");
    playlist.select("2");
    playlist.move("2", 0);
    expect(playlist.songs.toArray().map((s) => s.id)).toEqual(["2", "1", "3"]);
    expect(playlist.current?.id).toBe("2");
    expect(playlist.next(false)?.id).toBe("1");
    expect(playlist.next(false)?.id).toBe("3");
  });

  it("moves to the neighbor when the current song is removed", () => {
    const playlist = build("1", "2", "3");
    playlist.select("2");
    const removal = playlist.remove("2");
    expect(removal?.wasCurrent).toBe(true);
    expect(removal?.fallback?.id).toBe("3");
    expect(playlist.current?.id).toBe("3");
    playlist.remove("3");
    expect(playlist.current?.id).toBe("1");
    playlist.remove("1");
    expect(playlist.current).toBeNull();
  });

  it("never repeats the current song in shuffle", () => {
    const playlist = build("1", "2", "3");
    playlist.selectFirst();
    for (let i = 0; i < 50; i++) {
      const before = playlist.current;
      expect(playlist.random()).not.toBe(before);
    }
  });
});
