import {
  Bot,
  Brain,
  CheckSquare,
  Code2,
  ExternalLink,
  FolderOpen,
  GripVertical,
  Hash,
  Lightbulb,
  MessageCircle,
  MonitorPlay,
  Music,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Square,
  Trash2,
  Tv,
  Video,
  WandSparkles,
  X
} from "lucide-react";
import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_ICONS, PRESET_COLORS, UNCATEGORIZED_ID } from "../shared/constants";
import { normalizeAvatarUrl } from "../shared/avatar";
import { MESSAGE_TYPES } from "../shared/messages";
import {
  addCategory,
  deleteCategory,
  getChannelsForCategory,
  moveChannels,
  renameCategory,
  reorderCategories,
  searchAllChannels,
  setCategoryAppearance
} from "../shared/state";
import { isExtensionContextInvalidated, loadOrImportInitialState, saveState, STORAGE_STATE_KEY } from "../shared/storage";
import type { Category, CategoryIconId, Channel, ExtensionState } from "../shared/types";
import { injectSubscriptionScripts, isMissingContentScript } from "./tab-refresh";

type CategoryRow = {
  category: Category;
  count: number;
};

type CategoryDraft = {
  mode: "create" | "edit";
  id: string;
  name: string;
  color: string;
  icon: CategoryIconId;
};

type FetchAvatarResponse = {
  ok: boolean;
  dataUrl?: string;
  error?: string;
};

const iconComponents: Record<CategoryIconId, typeof Hash> = {
  default: Hash,
  open: FolderOpen,
  video: Video,
  channel: Tv,
  ai: Bot,
  code: Code2,
  learning: Brain,
  music: Music,
  idea: Lightbulb,
  interview: MessageCircle
};

const categoryLabel = (category: Category) => `${category.name} (${category.channelIds.length})`;

const channelInitial = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";

const getRows = (state: ExtensionState): CategoryRow[] => [
  {
    category: state.categories[UNCATEGORIZED_ID],
    count: state.uncategorizedChannelIds.length
  },
  ...state.categoryOrder
    .map((id) => state.categories[id])
    .filter(Boolean)
    .map((category) => ({ category, count: category.channelIds.length }))
];

const sendOpenChannel = async (url: string) => {
  try {
    await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_CHANNEL, url });
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

const makeCategoryId = () => `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const requestSubscriptionRefresh = async (tabId: number) => {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.COLLECT_SUBSCRIPTIONS });
  } catch (error) {
    if (!isMissingContentScript(error)) {
      throw error;
    }
    await injectSubscriptionScripts(tabId);
    return chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.COLLECT_SUBSCRIPTIONS });
  }
};

const CategoryIcon = ({ icon }: { icon: CategoryIconId }) => {
  const Icon = iconComponents[icon] ?? Hash;
  return <Icon size={15} strokeWidth={2.25} />;
};

const fetchAvatarThroughBackground = async (url: string): Promise<string | undefined> => {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.FETCH_AVATAR,
      url
    })) as FetchAvatarResponse | undefined;
    return response?.ok ? response.dataUrl : undefined;
  } catch {
    return undefined;
  }
};

const ChannelAvatar = ({ channel }: { channel: Channel }) => {
  const initialUrl = normalizeAvatarUrl(channel.avatarUrl);
  const [src, setSrc] = useState(initialUrl);
  const [failed, setFailed] = useState(false);
  const [proxyTried, setProxyTried] = useState(false);
  const fallback = channelInitial(channel.name);

  useEffect(() => {
    setSrc(initialUrl);
    setFailed(false);
    setProxyTried(false);
  }, [initialUrl]);

  if (!src || failed) {
    return <span className="avatar">{fallback}</span>;
  }

  const handleError = (_event: SyntheticEvent<HTMLImageElement>) => {
    if (proxyTried) {
      setFailed(true);
      return;
    }
    setProxyTried(true);
    void fetchAvatarThroughBackground(src).then((dataUrl) => {
      if (dataUrl) {
        setSrc(dataUrl);
      } else {
        setFailed(true);
      }
    });
  };

  return (
    <span className="avatar">
      <img src={src} alt="" loading="lazy" onError={handleError} />
    </span>
  );
};

export function App() {
  const [state, setState] = useState<ExtensionState | undefined>();
  const [selectedCategoryId, setSelectedCategoryId] = useState(UNCATEGORIZED_ID);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [moveTargetId, setMoveTargetId] = useState(UNCATEGORIZED_ID);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | undefined>();
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | undefined>();
  const [status, setStatus] = useState("准备就绪");
  const editorNameInputRef = useRef<HTMLInputElement>(null);

  const persist = async (next: ExtensionState) => {
    setState(next);
    await saveState(next);
  };

  useEffect(() => {
    let mounted = true;
    void loadOrImportInitialState()
      .then((loaded) => {
        if (mounted) {
          setState(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!isExtensionContextInvalidated(error)) {
          setStatus(String(error));
        }
      });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "local" && changes[STORAGE_STATE_KEY]?.newValue && mounted) {
        setState(changes[STORAGE_STATE_KEY].newValue as ExtensionState);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const rows = useMemo(() => (state ? getRows(state) : []), [state]);
  const currentCategory = state?.categories[selectedCategoryId] ?? state?.categories[UNCATEGORIZED_ID];
  const searchHits = useMemo(
    () => (state && search.trim() ? searchAllChannels(state, search) : undefined),
    [search, state]
  );
  const currentChannels = useMemo(() => {
    if (!state || !currentCategory) {
      return [];
    }
    if (searchHits) {
      return searchHits.map((hit) => hit.channel);
    }
    return getChannelsForCategory(state, currentCategory.id);
  }, [currentCategory, searchHits, state]);
  const categoryLabels = useMemo(
    () => (searchHits ? new Map(searchHits.map((hit) => [hit.channel.id, hit.categoryName])) : undefined),
    [searchHits]
  );
  const selectedCount = selectedChannelIds.size;

  useEffect(() => {
    if (!categoryDraft) {
      return;
    }
    editorNameInputRef.current?.focus();
    editorNameInputRef.current?.select();
  }, [categoryDraft?.id, categoryDraft?.mode]);

  const refreshSubscriptions = async () => {
    setStatus("正在刷新订阅");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.includes("youtube.com")) {
        setStatus("请在 YouTube 页面刷新");
        return;
      }
      const response = await requestSubscriptionRefresh(tab.id);
      if (!response?.ok) {
        setStatus(response?.error ?? "刷新失败");
        return;
      }
      const loaded = await loadOrImportInitialState();
      setState(loaded);
      setSelectedChannelIds(new Set());
      setStatus(`已通过 YouTube 登录态刷新 ${response.channels?.length ?? 0} 个频道`);
    } catch (error) {
      setStatus(isExtensionContextInvalidated(error) ? "扩展上下文已刷新，请重新打开弹窗" : "刷新失败，请确认 YouTube 页面已打开");
    }
  };

  const createCategory = () => {
    if (!state) {
      return;
    }
    setCategoryDraft({
      mode: "create",
      id: makeCategoryId(),
      name: "新分类",
      color: PRESET_COLORS[state.categoryOrder.length % PRESET_COLORS.length],
      icon: "default"
    });
  };

  const editCategory = (category: Category) => {
    if (category.isSystem) {
      return;
    }
    setSelectedCategoryId(category.id);
    setCategoryDraft({
      mode: "edit",
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon
    });
  };

  const removeCategory = async (categoryId: string) => {
    if (!state || categoryId === UNCATEGORIZED_ID) {
      return;
    }
    const next = deleteCategory(state, categoryId);
    setSelectedCategoryId(UNCATEGORIZED_ID);
    if (categoryDraft?.id === categoryId) {
      setCategoryDraft(undefined);
    }
    await persist(next);
  };

  const saveCategoryDraft = async () => {
    if (!state || !categoryDraft) {
      return;
    }
    const name = categoryDraft.name.trim() || "新分类";
    let next = state;
    if (categoryDraft.mode === "create") {
      next = addCategory(next, {
        id: categoryDraft.id,
        name,
        color: categoryDraft.color,
        icon: categoryDraft.icon
      });
    } else {
      next = renameCategory(next, categoryDraft.id, name);
      next = setCategoryAppearance(next, categoryDraft.id, {
        color: categoryDraft.color,
        icon: categoryDraft.icon
      });
    }
    setSelectedCategoryId(categoryDraft.id);
    setCategoryDraft(undefined);
    setStatus("已保存分类");
    await persist(next);
  };

  const dropCategory = async (targetCategoryId: string, event: React.DragEvent) => {
    event.preventDefault();
    if (!state) {
      return;
    }
    const channelId = event.dataTransfer.getData("application/x-ytdlp-channel");
    if (channelId) {
      await persist(moveChannels(state, [channelId], targetCategoryId));
      setSelectedChannelIds(new Set());
      return;
    }
    const sourceCategoryId = draggedCategoryId || event.dataTransfer.getData("application/x-ytdlp-category");
    if (!sourceCategoryId || sourceCategoryId === targetCategoryId || sourceCategoryId === UNCATEGORIZED_ID) {
      return;
    }
    const nextOrder = [...state.categoryOrder];
    const sourceIndex = nextOrder.indexOf(sourceCategoryId);
    const targetIndex = nextOrder.indexOf(targetCategoryId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, sourceCategoryId);
    await persist(reorderCategories(state, nextOrder));
  };

  const toggleChannel = (channelId: string) => {
    setSelectedChannelIds((previous) => {
      const next = new Set(previous);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedChannelIds(new Set(currentChannels.map((channel) => channel.id)));
  };

  const clearSelected = () => {
    setSelectedChannelIds(new Set());
  };

  const moveSelected = async () => {
    if (!state || selectedChannelIds.size === 0) {
      return;
    }
    await persist(moveChannels(state, Array.from(selectedChannelIds), moveTargetId));
    clearSelected();
  };

  if (!state || !currentCategory) {
    return (
      <main className="popup-shell loading">
        <WandSparkles size={20} />
        <span>加载中</span>
      </main>
    );
  }

  return (
    <main className="popup-shell">
      <section className="category-pane">
        <div className="pane-header">
          <div>
            <h1>YTD List Pro</h1>
            <p>{rows.length} 个分类</p>
          </div>
          <button className="icon-button" type="button" onClick={createCategory} title="新建分类">
            <Plus size={17} />
          </button>
        </div>

        <div className="category-list">
          {rows.map(({ category, count }) => {
            const Icon = iconComponents[category.icon] ?? Hash;
            const active = category.id === currentCategory.id;
            return (
              <div
                className={`category-row ${active ? "is-active" : ""}`}
                data-system={category.isSystem ? "true" : "false"}
                draggable={!category.isSystem}
                key={category.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedCategoryId(category.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedCategoryId(category.id);
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropCategory(category.id, event)}
                onDragStart={(event) => {
                  setDraggedCategoryId(category.id);
                  event.dataTransfer.setData("application/x-ytdlp-category", category.id);
                }}
              >
                <GripVertical className="drag-handle" size={15} />
                <span className="category-mark" style={{ backgroundColor: category.color }}>
                  <Icon size={14} />
                </span>
                <span className="category-name">{category.name}</span>
                <span className="category-count">{count}</span>
                <span className="category-actions">
                  {!category.isSystem && (
                    <>
                      <button
                        className="icon-button"
                        type="button"
                        title="编辑分类"
                        onClick={(event) => {
                          event.stopPropagation();
                          editCategory(category);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="mini-danger"
                        type="button"
                        title="删除分类"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeCategory(category.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="channel-pane">
        <div className="toolbar">
          <button className="primary-button" type="button" onClick={refreshSubscriptions}>
            <RefreshCw size={16} />
            <span>刷新频道</span>
          </button>
          <label className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="搜索全部分类" />
          </label>
          <button className="plain-button" type="button" onClick={selectAllVisible}>
            <CheckSquare size={16} />
            <span>全选</span>
          </button>
          <button className="plain-button" type="button" onClick={clearSelected}>
            <Square size={16} />
            <span>取消</span>
          </button>
        </div>

        <div className="channel-summary">
          <div>
            <h2>{searchHits ? "搜索结果" : currentCategory.name}</h2>
            <p>
              {searchHits
                ? `全部分类中找到 ${currentChannels.length} 个频道，已选 ${selectedCount} 个`
                : `${currentChannels.length} 个频道，已选 ${selectedCount} 个`}
            </p>
          </div>
          <div className="move-tools">
            <select value={moveTargetId} onChange={(event) => setMoveTargetId(event.currentTarget.value)}>
              {rows.map(({ category }) => (
                <option key={category.id} value={category.id}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
            <button className="plain-button" type="button" onClick={moveSelected} disabled={selectedCount === 0}>
              <ExternalLink size={15} />
              <span>移动</span>
            </button>
          </div>
        </div>

        <div className="channel-list">
          {currentChannels.map((channel) => {
            const checked = selectedChannelIds.has(channel.id);
            return (
              <div
                className={checked ? "channel-row is-selected" : "channel-row"}
                draggable
                key={channel.id}
                onDoubleClick={() => sendOpenChannel(channel.url)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-ytdlp-channel", channel.id);
                }}
              >
                <label className="checkbox-wrap">
                  <input type="checkbox" checked={checked} onChange={() => toggleChannel(channel.id)} />
                  <span>{checked ? <CheckSquare size={17} /> : <Square size={17} />}</span>
                </label>
                <ChannelAvatar channel={channel} />
                <span className="channel-text">
                  <strong>
                    {channel.name}
                    {categoryLabels?.get(channel.id) && (
                      <span className="channel-category-badge">{categoryLabels.get(channel.id)}</span>
                    )}
                  </strong>
                  <small>{channel.handle ?? channel.id}</small>
                </span>
                <button className="icon-button" type="button" onClick={() => sendOpenChannel(channel.url)} title="打开频道">
                  <ExternalLink size={15} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="status-line">{status}</div>
      </section>

      {categoryDraft && (
        <div className="category-editor-backdrop" role="presentation">
          <section
            className="category-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-editor-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setCategoryDraft(undefined);
              }
            }}
          >
            <div className="editor-header">
              <h2 id="category-editor-title">{categoryDraft.mode === "create" ? "新建分类" : "编辑分类"}</h2>
              <button className="icon-button" type="button" title="关闭" onClick={() => setCategoryDraft(undefined)}>
                <X size={16} />
              </button>
            </div>

            <label className="editor-field">
              <span>名称</span>
              <input
                ref={editorNameInputRef}
                name="category-name"
                value={categoryDraft.name}
                onChange={(event) =>
                  setCategoryDraft((draft) => (draft ? { ...draft, name: event.currentTarget.value } : draft))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveCategoryDraft();
                  }
                }}
              />
            </label>

            <div className="editor-preview">
              <span className="category-mark" style={{ backgroundColor: categoryDraft.color }}>
                <CategoryIcon icon={categoryDraft.icon} />
              </span>
              <strong>{categoryDraft.name.trim() || "新分类"}</strong>
            </div>

            <div className="editor-section">
              <span className="editor-label">颜色</span>
              <div className="color-grid">
                {PRESET_COLORS.map((color) => (
                  <button
                    className={color === categoryDraft.color ? "swatch is-active" : "swatch"}
                    key={color}
                    style={{ backgroundColor: color }}
                    type="button"
                    title={color}
                    onClick={() => setCategoryDraft((draft) => (draft ? { ...draft, color } : draft))}
                  />
                ))}
              </div>
              <label className="custom-color-row">
                <span>自定义</span>
                <input
                  className="custom-color"
                  type="color"
                  value={categoryDraft.color}
                  onChange={(event) =>
                    setCategoryDraft((draft) => (draft ? { ...draft, color: event.currentTarget.value } : draft))
                  }
                  title="自定义颜色"
                />
                <code>{categoryDraft.color}</code>
              </label>
            </div>

            <div className="editor-section">
              <span className="editor-label">图标</span>
              <div className="icon-grid">
                {CATEGORY_ICONS.map((item) => (
                  <button
                    className={item.id === categoryDraft.icon ? "icon-choice is-active" : "icon-choice"}
                    key={item.id}
                    type="button"
                    title={item.label}
                    onClick={() => setCategoryDraft((draft) => (draft ? { ...draft, icon: item.id } : draft))}
                  >
                    <CategoryIcon icon={item.id} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="editor-actions">
              <button className="plain-button" type="button" onClick={() => setCategoryDraft(undefined)}>
                <X size={15} />
                <span>取消</span>
              </button>
              <button className="primary-button" type="button" onClick={saveCategoryDraft}>
                <Save size={15} />
                <span>保存</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
