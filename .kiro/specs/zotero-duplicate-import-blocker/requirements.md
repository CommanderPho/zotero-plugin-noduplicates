# Requirements Document

## Introduction

This document specifies the requirements for the **zotero-duplicate-import-blocker** plugin ("No Duplicates") for Zotero 9. The plugin intercepts item-add events via Zotero's `Notifier` system, checks each new regular item against existing library items using Zotero's built-in `Duplicates` engine, and automatically moves confirmed duplicates to the trash while showing the user a non-blocking toast notification. The design is intentionally minimal: no preferences UI, no persistent storage, no modal dialogs.

## Glossary

- **Plugin**: The zotero-duplicate-import-blocker Zotero extension ("No Duplicates").
- **NoDuplicatesFactory**: The `NoDuplicatesFactory` static class in `src/modules/noDuplicates.ts` — the core module that owns notifier registration and drives detection/blocking for each add event.
- **Notifier**: Zotero's internal publish/subscribe bus (`Zotero.Notifier`) that emits events when library items change.
- **Regular_Item**: A Zotero item for which `item.isRegularItem()` returns `true` — i.e., a top-level bibliographic record (journal article, book, etc.). Excludes notes, attachments, feed items, and child items.
- **Duplicate_Set**: The set of items returned by `Zotero.Duplicates.getSetItemsByItemID(id)` for a given item — all library items that Zotero considers identical to the queried item, including the queried item itself.
- **Existing_Item**: Any item in the Duplicate_Set other than the newly-added item, whose `deleted` property is `false`.
- **Trash**: Zotero's soft-delete state (`item.deleted === true`). Items in the trash are hidden from the main library view but remain in the database and can be restored by the user.
- **ProgressWindow**: A non-blocking, auto-closing toast notification provided by `zotero-plugin-toolkit`.
- **Bootstrap**: The plugin's top-level entry point (`addon/bootstrap.js`) that is called by Zotero's extension loader on startup and shutdown.

---

## Requirements

### Requirement 1: Plugin Lifecycle Management

**User Story:** As a Zotero user, I want the duplicate-blocking plugin to start and stop cleanly, so that it does not leak observers or interfere with Zotero when it is disabled or updated.

#### Acceptance Criteria

1. WHEN the Plugin's `startup` lifecycle hook is called, THE NoDuplicatesFactory SHALL register exactly one observer with `Zotero.Notifier` for the `"item"` event type.
2. WHEN the Plugin's `shutdown` lifecycle hook is called, THE NoDuplicatesFactory SHALL unregister its `Zotero.Notifier` observer.
3. WHEN `registerNotifier()` is called while an observer is already registered, THE NoDuplicatesFactory SHALL not register a second observer.
4. WHEN the plugin shuts down, THE NoDuplicatesFactory SHALL unregister its observer via the `Zotero.Plugins.addObserver` shutdown callback.
5. THE Bootstrap SHALL await `Zotero.initializationPromise`, `Zotero.unlockPromise`, and `Zotero.uiReadyPromise` before calling `registerNotifier()`.

---

### Requirement 2: Event Filtering

**User Story:** As a Zotero user, I want the plugin to only act on newly-added regular library items, so that my notes, attachments, feed items, and other internal Zotero events are never affected.

#### Acceptance Criteria

1. WHEN a Notifier event with `type !== "item"` is received, THE NoDuplicatesFactory SHALL take no action and return immediately.
2. WHEN a Notifier event with `event !== "add"` is received, THE NoDuplicatesFactory SHALL take no action and return immediately.
3. WHEN a Notifier `item/add` event is received and an item ID in the payload refers to a note (`isRegularItem()` returns `false`), THE NoDuplicatesFactory SHALL skip that item.
4. WHEN a Notifier `item/add` event is received and an item ID in the payload refers to an attachment (`isRegularItem()` returns `false`), THE NoDuplicatesFactory SHALL skip that item.
5. WHEN a Notifier `item/add` event is received and an item ID in the payload refers to an item that has `deleted === true`, THE NoDuplicatesFactory SHALL skip that item.
6. WHEN a Notifier `item/add` event is received and an item ID in the payload refers to a feed item (`isFeedItem` is `true`), THE NoDuplicatesFactory SHALL skip that item.
7. WHEN a Notifier `item/add` event is received and an item ID in the payload cannot be resolved by `Zotero.Items.get()`, THE NoDuplicatesFactory SHALL skip that item without throwing.

---

### Requirement 3: Duplicate Detection

**User Story:** As a Zotero user, I want the plugin to use the same duplicate-detection logic as Zotero's built-in duplicate finder, so that only items Zotero itself would consider duplicates are blocked.

#### Acceptance Criteria

1. WHEN checking whether a new Regular_Item is a duplicate, THE NoDuplicatesFactory SHALL use `Zotero.Duplicates` to obtain the Duplicate_Set for that item by calling `_findDuplicates()` followed by `getSetItemsByItemID(itemID)`.
2. WHEN the Duplicate_Set contains at least one Existing_Item (non-deleted item other than the new item), THE NoDuplicatesFactory SHALL treat the new item as a duplicate.
3. WHEN the Duplicate_Set contains only the new item itself (set length <= 1), THE NoDuplicatesFactory SHALL treat the new item as unique and leave it unmodified.
4. WHEN a member of the Duplicate_Set has `deleted === true`, THE NoDuplicatesFactory SHALL exclude that member when counting Existing_Items.
5. THE NoDuplicatesFactory SHALL never treat the newly-added item itself as its own Existing_Item.
6. WHEN `Zotero.Duplicates` is unavailable or throws during instantiation or `_findDuplicates()`, THE NoDuplicatesFactory SHALL return `null` from `checkForDuplicates`, log the error via `ztoolkit.log`, and leave the item unmodified.

---

### Requirement 4: Blocking Behavior (Move to Trash)

**User Story:** As a Zotero user, I want duplicate imports to be moved to the trash rather than permanently deleted, so that I can review and recover them if needed.

#### Acceptance Criteria

1. WHEN a newly-added Regular_Item is identified as a duplicate, THE NoDuplicatesFactory SHALL set `item.deleted = true` and call `item.saveTx()` to move the item to the Trash.
2. THE NoDuplicatesFactory SHALL NOT call `item.erase()` or any method that permanently removes an item from the Zotero database.
3. WHEN `item.saveTx()` succeeds, THE NoDuplicatesFactory SHALL consider the item blocked and proceed to show the notification.
4. IF `item.saveTx()` throws, THEN THE NoDuplicatesFactory SHALL catch the exception, log it via `ztoolkit.log`, and show an error-variant ProgressWindow toast.
5. WHEN a Regular_Item is determined not to be a duplicate, THE NoDuplicatesFactory SHALL leave that item unmodified.

---

### Requirement 5: User Notification

**User Story:** As a Zotero user, I want to be informed when a duplicate import is blocked, so that I understand what happened and can locate the existing item.

#### Acceptance Criteria

1. WHEN a duplicate item is successfully moved to the Trash, THE NoDuplicatesFactory SHALL show a ProgressWindow toast in the main Zotero window.
2. WHEN showing the toast, THE NoDuplicatesFactory SHALL include the title of the blocked (newly-added) item in the toast message.
3. WHEN showing the toast, THE NoDuplicatesFactory SHALL include the title of the Existing_Item that caused the block in the toast message.
4. THE ProgressWindow toast SHALL auto-close after approximately 4 seconds without requiring user interaction.
5. THE ProgressWindow toast SHALL NOT be a modal dialog and SHALL NOT block Zotero's UI thread.
6. IF `item.saveTx()` throws, THEN THE NoDuplicatesFactory SHALL show an error-variant ProgressWindow toast informing the user that the duplicate could not be blocked.

---

### Requirement 6: Bulk Import Handling

**User Story:** As a Zotero user, I want the plugin to correctly handle importing multiple items at once (e.g., from a BibTeX file), so that all duplicates in the batch are identified and blocked.

#### Acceptance Criteria

1. WHEN a Notifier `item/add` event contains multiple item IDs, THE NoDuplicatesFactory SHALL evaluate every item ID in the batch independently against the duplicate detection criteria.
2. WHEN multiple items in a single batch are identified as duplicates, THE NoDuplicatesFactory SHALL move each duplicate to the Trash and show a separate notification for each blocked item.
3. WHEN some items in a batch are duplicates and others are not, THE NoDuplicatesFactory SHALL block only the duplicate items and leave the non-duplicate items unmodified.
4. WHEN processing a batch and one item's duplicate check or trash operation throws an error, THE NoDuplicatesFactory SHALL catch that error and continue processing the remaining items in the batch.

---

### Requirement 7: Scope Exclusions

**User Story:** As a Zotero user, I want notes, attachments, and feed items to be completely ignored by the plugin, so that routine Zotero operations that create child items are unaffected.

#### Acceptance Criteria

1. THE NoDuplicatesFactory SHALL only invoke duplicate checking for items where `item.isRegularItem()` returns `true`.
2. WHEN an item's `isRegularItem()` returns `false` (notes, attachments, annotations, child items), THE NoDuplicatesFactory SHALL skip that item without performing any duplicate check.
3. WHEN an item's `isFeedItem` is `true`, THE NoDuplicatesFactory SHALL skip that item without performing any duplicate check.
4. `Zotero.Duplicates` SHALL never be instantiated for items that do not satisfy the Regular_Item and non-feed-item criteria.

---

### Requirement 8: Graceful Degradation

**User Story:** As a Zotero user, I want the plugin to fail safely if Zotero's internal duplicate API changes, so that my library is never corrupted and the plugin does not crash Zotero.

#### Acceptance Criteria

1. IF `Zotero.Duplicates` is not available as a constructor, THEN THE NoDuplicatesFactory SHALL allow the item to remain in the library unblocked and log a warning via `ztoolkit.log`.
2. IF `Zotero.Duplicates._findDuplicates()` throws, THEN THE NoDuplicatesFactory SHALL catch the exception, log it via `ztoolkit.log`, and leave the item unmodified.
3. WHEN graceful degradation is triggered for one item, THE Plugin SHALL continue operating for subsequent `item/add` events rather than entering a broken state.
4. WHEN an item that was being checked no longer exists (race condition between add and delete), THE NoDuplicatesFactory SHALL skip that item without error or notification.
