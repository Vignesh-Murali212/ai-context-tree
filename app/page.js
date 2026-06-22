"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import ReactFlow, {
  Background,
  ReactFlowProvider,
  useReactFlow,
  Handle,
  Position
} from "reactflow";
import "reactflow/dist/style.css";

// ─── Node Component ────────────────────────────────────────────────────────────

const ContextNode = ({ data, selected }) => {
  const isHubMode = data.mode === "hub";
  const size = isHubMode ? 180 : 340;
  const padding = isHubMode ? "20px" : "45px";

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: data.loading ? "#0a0a1a" : "#ffffff",
        color: data.loading ? "#4488ff" : "#000",
        border: `6px solid ${selected ? "#0070f3" : data.loading ? "#0030aa" : "#333"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding,
        textAlign: "center",
        boxShadow: selected
          ? "0 25px 70px rgba(0,112,243,0.45)"
          : data.loading
          ? "0 10px 40px rgba(0,80,255,0.3)"
          : "0 10px 30px rgba(0,0,0,0.5)",
        fontSize: isHubMode ? "11px" : "13px",
        fontWeight: isHubMode ? "800" : "500",
        transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        flexDirection: "column",
        gap: "8px",
        overflow: "hidden"
      }}
    >
      <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />

      {data.loading ? (
        <div style={{ fontSize: isHubMode ? "11px" : "14px", color: "#4488ff", fontWeight: "700" }}>
          thinking...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
          {/* Question */}
          {data.question && (
            <div
              style={{
                fontSize: isHubMode ? "10px" : "12px",
                fontWeight: "700",
                color: "#0050cc",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: isHubMode ? 2 : 3,
                WebkitBoxOrient: "vertical",
                lineHeight: 1.3
              }}
            >
              {data.question}
            </div>
          )}

          {/* Divider — only in spotlight when both exist */}
          {!isHubMode && data.question && data.answer && (
            <div style={{ width: "40px", height: "1px", background: "#ccc", margin: "2px auto" }} />
          )}

          {/* Answer */}
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: isHubMode ? 4 : 8,
              WebkitBoxOrient: "vertical",
              lineHeight: 1.5,
              fontSize: isHubMode ? "10px" : "13px"
            }}
          >
            {data.answer || data.label}
          </div>
        </div>
      )}

      {data.hasChildren && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: isHubMode ? "16px" : "24px",
            color: data.loading ? "#4488ff" : "#000",
            pointerEvents: "none"
          }}
        >
          ⌄
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ visibility: "hidden" }} />
    </div>
  );
};

// ─── Claude API ────────────────────────────────────────────────────────────────

async function callClaude(ancestorChain, currentQuestion) {
  // Build messages: each ancestor is a user turn + assistant turn
  const messages = [];

  for (const node of ancestorChain) {
    messages.push({ role: "user", content: node.question });
    messages.push({ role: "assistant", content: node.answer });
  }

  // The current question is the final user turn
  messages.push({ role: "user", content: currentQuestion });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system:
        "You are an intelligent memory system embedded in a visual context tree. " +
        "Each node in the tree represents a branch of thought. " +
        "You have full context of the conversation branch — every ancestor node is part of this thread. " +
        "Respond concisely and thoughtfully. Prefer insight over length. " +
        "You are not a chatbot. You are a thinking partner inside a branching mind map.",
      messages
    })
  });

  const data = await response.json();
  const text = data.content?.map((b) => b.text || "").join("") || "No response.";
  return text;
}

// ─── Tree Engine ───────────────────────────────────────────────────────────────

let idCounter = 1;

function TreeEngine() {
  const [history, setHistory] = useState([
    {
      id: "1",
      label: "Project Genesis",
      question: null,
      answer: "Project Genesis",
      parentId: null,
      depth: 0,
      loading: false
    }
  ]);
  const [activeId, setActiveId] = useState("1");
  const [question, setQuestion] = useState("");
  const [isBranching, setIsBranching] = useState(false);

  const { fitView } = useReactFlow();
  const nodeTypes = useMemo(() => ({ contextNode: ContextNode }), []);

  // Get all ancestors of a node (ordered root → parent)
  const getAncestorChain = useCallback(
    (nodeId) => {
      const chain = [];
      let current = history.find((h) => h.id === nodeId);
      while (current?.parentId) {
        current = history.find((h) => h.id === current.parentId);
        if (current) chain.unshift(current);
      }
      return chain.filter((n) => n.question && n.answer && !n.loading);
    },
    [history]
  );

  const { displayNodes, displayEdges } = useMemo(() => {
    const activeData = history.find((h) => h.id === activeId);
    const children = history.filter((h) => h.parentId === activeId);

    if (children.length > 0) {
      const nodes = [
        {
          id: activeId,
          type: "contextNode",
          data: {
            label: activeData?.answer,
            question: activeData?.question,
            answer: activeData?.answer,
            loading: activeData?.loading,
            mode: "hub",
            hasChildren: true
          },
          position: { x: 0, y: 0 },
          selected: true
        },
        ...children.map((child, i) => ({
          id: child.id,
          type: "contextNode",
          data: {
            label: child.answer || child.label,
            question: child.question,
            answer: child.answer,
            loading: child.loading,
            mode: "hub",
            hasChildren: history.some((h) => h.parentId === child.id)
          },
          position: {
            x: (i - (children.length - 1) / 2) * 280,
            y: 250
          }
        }))
      ];

      const edges = children.map((child) => ({
        id: `e-${activeId}-${child.id}`,
        source: activeId,
        target: child.id,
        animated: true,
        style: { stroke: "#0070f3", strokeWidth: 3 }
      }));

      return { displayNodes: nodes, displayEdges: edges };
    }

    return {
      displayNodes: [
        {
          id: activeId,
          type: "contextNode",
          data: {
            label: activeData?.answer || activeData?.label,
            question: activeData?.question,
            answer: activeData?.answer,
            loading: activeData?.loading,
            mode: "spotlight",
            hasChildren: false
          },
          position: { x: 0, y: 0 },
          selected: true
        }
      ],
      displayEdges: []
    };
  }, [history, activeId]);

  const triggerZoom = useCallback(() => {
    setTimeout(() => {
      fitView({
        duration: 800,
        padding: displayNodes.length > 1 ? 0.4 : 0.2,
        maxZoom: 1
      });
    }, 100);
  }, [fitView, displayNodes.length]);

  useEffect(() => {
    triggerZoom();
  }, [activeId, triggerZoom, displayNodes.length]);

  const onNodeClick = (evt, node) => {
    if (node.id !== activeId) setActiveId(node.id);
  };

  const addNode = async () => {
    if (!question.trim() || isBranching) return;

    setIsBranching(true);
    const newId = `${++idCounter}`;
    const parent = history.find((h) => h.id === activeId);
    const currentQuestion = question.trim();
    setQuestion("");

    // 1. Create node immediately in loading state
    setHistory((prev) => [
      ...prev,
      {
        id: newId,
        label: currentQuestion,
        question: currentQuestion,
        answer: null,
        parentId: activeId,
        depth: (parent?.depth || 0) + 1,
        loading: true
      }
    ]);
    setActiveId(newId);

    // 2. Build ancestor chain from current history snapshot
    const ancestors = getAncestorChain(activeId);

    // 3. Call Claude
    try {
      const answer = await callClaude(ancestors, currentQuestion);

      // 4. Update node with response
      setHistory((prev) =>
        prev.map((n) =>
          n.id === newId ? { ...n, answer, loading: false } : n
        )
      );
    } catch (err) {
      setHistory((prev) =>
        prev.map((n) =>
          n.id === newId
            ? { ...n, answer: "Error reaching Claude. Check your API key.", loading: false }
            : n
        )
      );
    }

    setIsBranching(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNode();
  };

  // Breadcrumb trail
  const breadcrumb = useMemo(() => {
    const trail = [];
    let current = history.find((h) => h.id === activeId);
    while (current) {
      trail.unshift(current);
      current = history.find((h) => h.id === current.parentId);
    }
    return trail;
  }, [history, activeId]);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        backgroundColor: "#050505",
        fontFamily: "sans-serif"
      }}
    >
      {/* LEFT TREE */}
      <div style={{ width: "70%", height: "100%", position: "relative" }}>
        <ReactFlow
          key={`view-${activeId}-${displayNodes.length}`}
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          nodesDraggable={false}
          zoomOnScroll={false}
          panOnDrag={displayNodes.length > 1}
        >
          <Background color="#111" gap={40} variant="dots" />
        </ReactFlow>
      </div>

      {/* RIGHT PANEL */}
      <div
        style={{
          width: "30%",
          padding: "50px",
          background: "#0f0f0f",
          color: "white",
          borderLeft: "1px solid #222",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <h2 style={{ fontSize: "24px", fontWeight: "900", color: "#0070f3", marginBottom: "20px" }}>
          CONTEXT TREE
        </h2>

        {/* Breadcrumb */}
        <div
          style={{
            marginBottom: "30px",
            fontSize: "11px",
            color: "#444",
            lineHeight: 1.6,
            display: "flex",
            flexWrap: "wrap",
            gap: "4px"
          }}
        >
          {breadcrumb.map((node, i) => (
            <span key={node.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span
                onClick={() => setActiveId(node.id)}
                style={{
                  color: node.id === activeId ? "#0070f3" : "#555",
                  cursor: "pointer",
                  maxWidth: "80px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "inline-block"
                }}
                title={node.question || node.label}
              >
                {node.question ? node.question.slice(0, 20) + (node.question.length > 20 ? "…" : "") : node.label}
              </span>
              {i < breadcrumb.length - 1 && <span style={{ color: "#333" }}>›</span>}
            </span>
          ))}
        </div>

        {/* Nav */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "30px" }}>
          <button
            onClick={() => {
              const current = history.find((h) => h.id === activeId);
              if (current?.parentId) setActiveId(current.parentId);
            }}
            disabled={activeId === "1"}
            style={{
              flex: 1,
              padding: "18px",
              background: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: "15px",
              color: "white",
              cursor: "pointer",
              opacity: activeId === "1" ? 0.2 : 1,
              fontWeight: "bold"
            }}
          >
            ← BACK
          </button>
          <button
            onClick={() => setActiveId("1")}
            style={{
              flex: 1,
              padding: "18px",
              background: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: "15px",
              color: "white",
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            ROOT
          </button>
        </div>

        {/* Current node answer preview */}
        {history.find((h) => h.id === activeId)?.answer && (
          <div
            style={{
              marginBottom: "20px",
              padding: "16px",
              background: "#080808",
              border: "1px solid #1a1a1a",
              borderRadius: "12px",
              fontSize: "12px",
              color: "#666",
              lineHeight: 1.6,
              maxHeight: "120px",
              overflowY: "auto"
            }}
          >
            {history.find((h) => h.id === activeId)?.answer}
          </div>
        )}

        <div style={{ flexGrow: 1 }}>
          <textarea
            placeholder="Branch this thought further... (⌘+Enter to send)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isBranching}
            style={{
              width: "100%",
              height: "180px",
              borderRadius: "20px",
              padding: "25px",
              backgroundColor: "#080808",
              color: "white",
              border: `1px solid ${isBranching ? "#0030aa" : "#222"}`,
              resize: "none",
              outline: "none",
              fontSize: "15px",
              lineHeight: "1.6",
              opacity: isBranching ? 0.5 : 1
            }}
          />

          <button
            onClick={addNode}
            disabled={isBranching || !question.trim()}
            style={{
              width: "100%",
              marginTop: "20px",
              padding: "22px",
              backgroundColor: isBranching ? "#003080" : "#0070f3",
              color: "white",
              border: "none",
              borderRadius: "20px",
              cursor: isBranching ? "not-allowed" : "pointer",
              fontWeight: "900",
              fontSize: "16px",
              transition: "background 0.3s"
            }}
          >
            {isBranching ? "THINKING..." : "BRANCH OUT →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <ReactFlowProvider>
      <TreeEngine />
    </ReactFlowProvider>
  );
}