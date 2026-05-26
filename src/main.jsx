import { createRoot } from 'react-dom/client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, Copy, Check, ExternalLink, X,
  Image as ImageIcon, ChevronDown, Github, ArrowUp,
  Database, Tag, SlidersHorizontal
} from 'lucide-react';
import './styles.css';

function padId(n) {
  return String(n).padStart(3, '0');
}

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTag, setActiveTag] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const [previewCase, setPreviewCase] = useState(null);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    fetch('./cases.json')
      .then(res => res.json())
      .then(json => { setData(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // keyboard shortcut: / to focus search, Esc to close preview
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (previewCase) setPreviewCase(null);
        else if (document.activeElement === searchRef.current) searchRef.current.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewCase]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.cases;
    if (activeCategory !== 'all') items = items.filter(c => c.category === activeCategory);
    if (activeTag !== 'all') items = items.filter(c => c.tags.includes(activeTag));
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.prompt.toLowerCase().includes(q) ||
        c.sourceLabel.toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, activeCategory, activeTag, search]);

  const copyPrompt = useCallback((id, prompt) => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const resetFilters = () => {
    setSearch('');
    setActiveCategory('all');
    setActiveTag('all');
  };

  const activeCats = data?.categories.filter(c => c.count > 0) || [];

  if (loading) {
    return (
      <div className="loadingScreen">
        <div className="loadingPulse" />
        <p className="loadingText">LOADING DATA</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loadingScreen">
        <p className="loadingText">ERROR: cases.json not found</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbarInner">
          <div className="brand">
            <Database size={15} strokeWidth={2} />
            <span className="brandText">PROMPT.DB</span>
          </div>
          <div className="topbarMeta">
            <span className="metaStat">
              <b>{data.totalCases}</b> cases
            </span>
            <span className="metaDivider">/</span>
            <span className="metaStat">
              <b>{activeCats.length}</b> categories
            </span>
            <span className="metaDivider">/</span>
            <span className="metaStat">
              <b>{data.tags.length}</b> tags
            </span>
            <a href={data.repository} target="_blank" rel="noopener noreferrer" className="ghLink" title="GitHub">
              <Github size={15} />
            </a>
          </div>
        </div>
      </header>

      {/* ── Controls ── */}
      <div className="controls">
        <div className="controlsInner">
          {/* Search */}
          <div className="searchRow">
            <div className="searchBox">
              <Search size={14} className="searchIcon" />
              <input
                ref={searchRef}
                type="text"
                placeholder="搜索提示词、标题、来源..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search ? (
                <button className="clearBtn" onClick={() => setSearch('')}>
                  <X size={13} />
                </button>
              ) : (
                <kbd className="searchKbd">/</kbd>
              )}
            </div>
            <button
              className={`tagToggleBtn ${showTagFilter ? 'active' : ''}`}
              onClick={() => setShowTagFilter(!showTagFilter)}
            >
              <Tag size={13} />
              标签
              <ChevronDown size={12} className={`tagToggleChev ${showTagFilter ? 'open' : ''}`} />
            </button>
          </div>

          {/* Category tabs */}
          <div className="catRow">
            <button
              className={`catTab ${activeCategory === 'all' ? 'active' : ''}`}
              onClick={() => setActiveCategory('all')}
            >
              ALL <span className="catCount">{data.totalCases}</span>
            </button>
            {data.categories.filter(c => c.count > 0).map(cat => (
              <button
                key={cat.id}
                className={`catTab ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.name.toUpperCase()} <span className="catCount">{cat.count}</span>
              </button>
            ))}
          </div>

          {/* Tag filter (collapsible) */}
          {showTagFilter && data.tags.length > 0 && (
            <div className="tagRow">
              <span className="tagRowLabel">TAGS</span>
              <button
                className={`tagChip ${activeTag === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTag('all')}
              >全部</button>
              {data.tags.map(tag => (
                <button
                  key={tag}
                  className={`tagChip ${activeTag === tag ? 'active' : ''}`}
                  onClick={() => setActiveTag(tag)}
                >{tag}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="statusBar">
        <div className="statusInner">
          <span className="statusText">
            显示 <b>{filtered.length}</b> / {data.totalCases} 条记录
          </span>
          {(search || activeCategory !== 'all' || activeTag !== 'all') && (
            <button className="resetLink" onClick={resetFilters}>
              <SlidersHorizontal size={12} />
              重置筛选
            </button>
          )}
        </div>
      </div>

      {/* ── Gallery Grid ── */}
      <div className="gallery">
        {filtered.map(caseItem => {
          const catName = data.categories.find(c => c.id === caseItem.category)?.name || '其他';
          return (
            <article key={caseItem.id} className="card">
              <div className="cardImage" onClick={() => setPreviewCase(caseItem)}>
                {caseItem.image ? (
                  <img
                    src={`.${caseItem.image}`}
                    alt={caseItem.imageAlt || caseItem.title}
                    loading="lazy"
                  />
                ) : (
                  <div className="noImage">
                    <ImageIcon size={24} strokeWidth={1} />
                    <span>NO IMAGE</span>
                  </div>
                )}
                <div className="cardIdOverlay">#{padId(caseItem.id)}</div>
              </div>
              <div className="cardBody">
                <div className="cardMeta">
                  <span className="cardId">#{padId(caseItem.id)}</span>
                  <span className="cardCat">{catName}</span>
                </div>
                <h3 className="cardTitle">{caseItem.title}</h3>
                {caseItem.tags.length > 0 && (
                  <div className="cardTags">
                    {caseItem.tags.map(tag => (
                      <span key={tag} className="cardTag">{tag}</span>
                    ))}
                  </div>
                )}
                <p className="cardPrompt">{caseItem.promptPreview}</p>
                <div className="cardActions">
                  <button
                    className={`actionBtn primary ${copiedId === caseItem.id ? 'copied' : ''}`}
                    onClick={() => copyPrompt(caseItem.id, caseItem.prompt)}
                  >
                    {copiedId === caseItem.id ? (
                      <><Check size={12} /> 已复制</>
                    ) : (
                      <><Copy size={12} /> 复制</>
                    )}
                  </button>
                  {caseItem.sourceUrl ? (
                    <a
                      href={caseItem.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="actionBtn"
                      title={caseItem.sourceLabel}
                    >
                      <ExternalLink size={12} />
                      {caseItem.sourceLabel}
                    </a>
                  ) : (
                    <span className="actionBtn disabled">{caseItem.sourceLabel}</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* ── Empty State ── */}
      {filtered.length === 0 && (
        <div className="emptyState">
          <Search size={40} strokeWidth={1} />
          <p className="emptyTitle">没有匹配结果</p>
          <p className="emptySub">尝试修改搜索词或重置筛选条件</p>
          <button className="resetBtn" onClick={resetFilters}>重置筛选</button>
        </div>
      )}

      {/* ── Preview Modal ── */}
      {previewCase && (
        <div className="modal" onClick={() => setPreviewCase(null)}>
          <div className="modalContent" onClick={e => e.stopPropagation()}>
            <button className="modalClose" onClick={() => setPreviewCase(null)}>
              <X size={18} />
            </button>
            <div className="modalImage">
              <img
                src={`.${previewCase.image}`}
                alt={previewCase.imageAlt || previewCase.title}
              />
            </div>
            <div className="modalBody">
              <div className="modalMeta">
                <span className="modalId">#{padId(previewCase.id)}</span>
                <span className="modalCat">
                  {data.categories.find(c => c.id === previewCase.category)?.name || '其他'}
                </span>
                {previewCase.tags.map(tag => (
                  <span key={tag} className="modalTag">{tag}</span>
                ))}
              </div>
              <h2 className="modalTitle">{previewCase.title}</h2>
              {previewCase.sourceUrl && (
                <a
                  href={previewCase.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modalSource"
                >
                  <ExternalLink size={12} />
                  {previewCase.sourceLabel}
                </a>
              )}
              <div className="modalPromptWrap">
                <span className="modalPromptLabel">PROMPT</span>
                <pre className="modalPrompt">{previewCase.prompt}</pre>
              </div>
              <button
                className={`modalCopyBtn ${copiedId === previewCase.id ? 'copied' : ''}`}
                onClick={() => copyPrompt(previewCase.id, previewCase.prompt)}
              >
                {copiedId === previewCase.id ? (
                  <><Check size={14} /> 已复制到剪贴板</>
                ) : (
                  <><Copy size={14} /> 复制完整提示词</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scroll to top ── */}
      {showScrollTop && (
        <button className="scrollTop" onClick={scrollToTop}>
          <ArrowUp size={16} />
        </button>
      )}

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footerInner">
          <span>GPT-Image2 提示词画廊 — 数据来源于社区分享，仅供学习参考</span>
          <a href={data.repository} target="_blank" rel="noopener noreferrer">
            <Github size={13} /> GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
