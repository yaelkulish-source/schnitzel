import { useState } from "react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";

const BURST_COLORS = ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF922B", "#CC5DE8", "#FF6B6B", "#FFD93D"];

function HeartIcon({ filled, color }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function Burst({ id }) {
  return (
    <AnimatePresence>
      {BURST_COLORS.map((color, i) => {
        const angle = (i / BURST_COLORS.length) * Math.PI * 2;
        const dist = 30;
        return (
          <motion.span
            key={`${id}-${i}`}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 5,
              height: 5,
              borderRadius: "50%",
              backgroundColor: color,
              pointerEvents: "none",
              translateX: "-50%",
              translateY: "-50%",
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist,
              opacity: 0,
              scale: 0,
            }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        );
      })}
    </AnimatePresence>
  );
}

export default function LikeButton() {
  const [liked, setLiked] = useState(false);
  const [burstKey, setBurstKey] = useState(null);
  const heartControls = useAnimation();

  async function handleClick() {
    const next = !liked;
    setLiked(next);

    if (next) {
      setBurstKey((k) => (k ?? 0) + 1);
      await heartControls.start({
        scale: [1, 1.5, 0.8, 1.2, 1],
        transition: {
          duration: 0.5,
          times: [0, 0.25, 0.45, 0.7, 1],
        },
      });
    } else {
      heartControls.start({
        scale: 1,
        transition: { type: "spring", stiffness: 350, damping: 18 },
      });
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#F5F5F5",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <motion.button
        onClick={handleClick}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 24px",
          borderRadius: 100,
          border: "none",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 0.2,
          outline: "none",
          overflow: "visible",
          userSelect: "none",
        }}
        animate={{
          backgroundColor: liked ? "#FFEBEB" : "#E8E8E8",
          color: liked ? "#C0392B" : "#707070",
          boxShadow: liked ? "0 0 0 1.5px #FFBDBD" : "0 0 0 1.5px #D8D8D8",
        }}
        whileHover={{
          scale: 1.05,
          boxShadow: liked ? "0 6px 20px #FFBDBD99" : "0 4px 14px #00000015",
        }}
        whileTap={{ scale: 0.93 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        {/* Heart icon with bounce animation */}
        <motion.span
          animate={heartControls}
          style={{ display: "flex", alignItems: "center", lineHeight: 1 }}
        >
          <HeartIcon filled={liked} color={liked ? "#C0392B" : "#909090"} />
        </motion.span>

        {/* Label */}
        <motion.span
          animate={{ color: liked ? "#C0392B" : "#707070" }}
          transition={{ duration: 0.15 }}
        >
          Like
        </motion.span>

        {/* Particle burst on like */}
        {burstKey !== null && <Burst id={burstKey} />}
      </motion.button>
    </div>
  );
}
