import { isEscapeKey } from "../../lib/keyboard";
import type { AppTheme } from "../../themes";

/** Render the active filter or search input, or a passive notice when nothing is active. */
export function StatusBar({
  filter,
  filterFocused,
  noticeText,
  terminalWidth,
  theme,
  searchActive = false,
  searchDraft = "",
  searchQuery = "",
  searchMatchCount = 0,
  searchCurrentIndex = 0,
  onCloseMenu,
  onFilterExit,
  onFilterInput,
  onFilterSubmit,
  onSearchExit,
  onSearchInput,
  onSearchSubmit,
}: {
  filter: string;
  filterFocused: boolean;
  noticeText?: string;
  terminalWidth: number;
  theme: AppTheme;
  /** Whether the search input is currently focused; mutually exclusive with `filterFocused`. */
  searchActive?: boolean;
  /** Draft text being typed into the search input. */
  searchDraft?: string;
  /** Committed search query (used to render the passive `search=` summary line). */
  searchQuery?: string;
  /** Total committed match count for the active query. */
  searchMatchCount?: number;
  /** 0-based cursor into the committed match list, used to render the M/N indicator. */
  searchCurrentIndex?: number;
  onCloseMenu: () => void;
  onFilterExit?: () => void;
  onFilterInput: (value: string) => void;
  onFilterSubmit: () => void;
  onSearchExit?: () => void;
  onSearchInput?: (value: string) => void;
  onSearchSubmit?: () => void;
}) {
  // Filter and search are mutually exclusive. If both flags somehow land on, prefer filter so we
  // don't double-render two focused inputs.
  const showSearchInput = searchActive && !filterFocused;
  const indicatorText =
    searchMatchCount > 0 ? `${searchCurrentIndex + 1}/${searchMatchCount}` : "0/0";

  return (
    <box
      style={{
        height: 1,
        backgroundColor: theme.panelAlt,
        paddingLeft: 1,
        paddingRight: 1,
        alignItems: "center",
        flexDirection: "row",
      }}
      onMouseUp={onCloseMenu}
    >
      {filterFocused ? (
        <>
          <text fg={theme.badgeNeutral}>filter:</text>
          <box style={{ width: 1, height: 1 }}>
            <text fg={theme.muted}> </text>
          </box>
          <input
            width={Math.max(12, terminalWidth - 11)}
            value={filter}
            placeholder="type to filter files"
            focused={true}
            onInput={onFilterInput}
            onSubmit={onFilterSubmit}
            onKeyDown={(key) => {
              // Pressing `f` again with an empty filter exits filter mode and returns
              // focus to the file list. Handle it here (rather than in the global
              // keyboard hook) so we can preventDefault before the input swallows the
              // keystroke as text input.
              if ((key.name === "f" || key.sequence === "f") && filter.length === 0) {
                key.preventDefault();
                key.stopPropagation();
                onFilterExit?.();
                return;
              }

              if (!isEscapeKey(key)) {
                return;
              }

              key.preventDefault();
              key.stopPropagation();

              if (filter.length > 0) {
                onFilterInput("");
                return;
              }

              onFilterSubmit();
            }}
          />
        </>
      ) : showSearchInput ? (
        <>
          <text fg={theme.badgeNeutral}>search:</text>
          <box style={{ width: 1, height: 1 }}>
            <text fg={theme.muted}> </text>
          </box>
          <input
            width={Math.max(12, terminalWidth - 11 - indicatorText.length - 2)}
            value={searchDraft}
            placeholder="type to search visible diff text"
            focused={true}
            onInput={(value: string) => onSearchInput?.(value)}
            onSubmit={() => onSearchSubmit?.()}
            onKeyDown={(key) => {
              // Mirror the filter exit handling so `/`-on-empty cancels search the same way
              // `f`-on-empty cancels the filter input.
              if ((key.name === "/" || key.sequence === "/") && searchDraft.length === 0) {
                key.preventDefault();
                key.stopPropagation();
                onSearchExit?.();
                return;
              }

              if (!isEscapeKey(key)) {
                return;
              }

              key.preventDefault();
              key.stopPropagation();

              // Esc clears the draft only on the first press (matching filter convention).
              // A second Esc on an empty draft tears down the search entirely, which also
              // drops highlights via `cancelSearch`.
              if (searchDraft.length > 0) {
                onSearchInput?.("");
                return;
              }

              onSearchExit?.();
            }}
          />
          <box style={{ width: 1, height: 1 }}>
            <text fg={theme.muted}> </text>
          </box>
          <text fg={theme.muted}>{indicatorText}</text>
        </>
      ) : filter.length > 0 ? (
        <text fg={theme.muted}>{`filter=${filter}`}</text>
      ) : searchQuery.length > 0 ? (
        <text fg={theme.muted}>{`search=${searchQuery}  ${indicatorText}`}</text>
      ) : (
        <text fg={theme.muted}>{noticeText ?? ""}</text>
      )}
    </box>
  );
}
