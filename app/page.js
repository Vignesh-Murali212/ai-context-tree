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
  const [expanded, setExpanded] = useState(false);
  const isHubMode = data.mode === "hub";
  const size = isHubMode ? 180 : 260;

  if (expanded) {
    return (
      <div
        style={{
          width: "380px",
          minHeight: "260px",
          maxHeight: "500px",
          borderRadius: "20px",
          background: "#ffffff",
          border: `6px solid #0070f3`,
          boxShadow: "0 25px 70px rgba(0,112,243,0.35)",
          padding: "30px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          position: "relative",
          overflow: "hidden"
        }}
      >
        <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />

        {/* Close button */}
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: "absolute",
            top: "14px",
            right: "18px",
            cursor: "pointer",
            fontSize: "18px",
            color: "#999",
            fontWeight: "bold",
            lineHeight: 1
          }}
        >
          ✕
        </div>

        {/* Question heading */}
        {data.question && (
          <div style={{ fontSize: "14px", fontWeight: "800", color: "#0050cc", lineHeight: 1.4, paddingRight: "24px" }}>
            {data.question}
          </div>
        )}

        {/* Divider */}
        <div style={{ width: "100%", height: "1px", background: "#eee" }} />

        {/* Full answer */}
        <div
          style={{
            fontSize: "13px",
            color: "#222",
            lineHeight: 1.7,
            overflowY: "auto",
            maxHeight: "340px",
            paddingRight: "4px"
          }}
        >
          {data.answer || data.label}
        </div>

        <Handle type="source" position={Position.Bottom} style={{ visibility: "hidden" }} />
      </div>
    );
  }

  return (
    <div
      onClick={() => { if (!data.loading) setExpanded(true); }}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: data.loading ? "#0a0a1a" : "#ffffff",
        color: data.loading ? "#4488ff" : "#000",
        border: `6px solid ${selected ? "#0070f3" : data.loading ? "#0030aa" : data.answer ? "#0070f3" : "#333"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isHubMode ? "20px" : "45px",
        textAlign: "center",
        boxShadow: selected
          ? "0 0 25px rgba(0,112,243,0.35)"
          : data.loading
          ? "0 10px 40px rgba(0,80,255,0.3)"
          : data.answer
          ? "0 0 20px rgba(0,112,243,0.4)"
          : "0 10px 30px rgba(0,0,0,0.5)",
        fontSize: isHubMode ? "11px" : "13px",
        fontWeight: "800",
        transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        flexDirection: "column",
        cursor: data.loading ? "default" : "pointer",
        overflow: "hidden"
      }}
    >
      <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />

      {data.loading ? (
        <div style={{ fontSize: "13px", color: "#4488ff", fontWeight: "700" }}>
          thinking...
        </div>
      ) : (
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            lineHeight: 1.4,
            color: "#0050cc"
          }}
        >
          {data.question || data.label}
        </div>
      )}

      {data.answer && (
        <div style={{
          position: "absolute",
          bottom: "18px",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "9px",
          color: "#0070f3",
          fontWeight: "700",
          letterSpacing: "0.05em",
          whiteSpace: "nowrap"
        }}>
          tap to read
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ visibility: "hidden" }} />
    </div>
  );
};

// ─── Grok API ────────────────────────────────────────────────────────────────

async function callGroq(ancestorChain, currentQuestion) {
  const messages = [];

  for (const node of ancestorChain) {
    messages.push({ role: "user", content: node.question });
    messages.push({ role: "assistant", content: node.answer });
  }

  messages.push({ role: "user", content: currentQuestion });

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      systemPrompt:
        "You are an intelligent memory system embedded in a visual context tree. " +
        "Each node in the tree represents a branch of thought. " +
        "You have full context of the conversation branch — every ancestor node is part of this thread. " +
        "Respond concisely and thoughtfully. Prefer insight over length. " +
        "You are not a chatbot. You are a thinking partner inside a branching mind map."
    })
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response.";
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
      const answer = await callGroq(ancestors, currentQuestion);

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
          proOptions={{ hideAttribution: true }}
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
            placeholder="Branch this thought further..."
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