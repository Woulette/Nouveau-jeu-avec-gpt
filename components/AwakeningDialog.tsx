"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { AwakenedCombatPath } from "@/game/shared/types";

import styles from "./AwakeningDialog.module.css";

export interface HudAwakeningDialogue {
  npcId: string;
  status: "level-required" | "eligible" | "completed";
  requiredLevel: number;
  currentLevel: number;
  className: string;
  rank: string | null;
}

interface AwakeningDialogProps {
  dialogue: HudAwakeningDialogue;
  error?: string | null;
  onClose(): void;
  onAwaken(path: AwakenedCombatPath): void;
}

const PATHS: ReadonlyArray<{
  id: AwakenedCombatPath;
  name: string;
  icon: string;
  role: string;
  description: string;
  accent: string;
}> = [
  {
    id: "melee",
    name: "Épéiste",
    icon: "⚔",
    role: "Corps à corps",
    description: "Une voie frontale, solide et précise. Tes 25 premiers points vont au corps à corps.",
    accent: "#efb86d",
  },
  {
    id: "ranged",
    name: "Archer",
    icon: "➶",
    role: "Distance",
    description: "Une voie mobile qui frappe avant d’être atteinte. Tes 25 premiers points vont à la distance.",
    accent: "#65d6ae",
  },
  {
    id: "magic",
    name: "Magicien",
    icon: "✦",
    role: "Magie",
    description: "Une voie de puissance et de contrôle. Tes 25 premiers points vont à la magie.",
    accent: "#9da6ff",
  },
];

function stopWorldPointer(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

export default function AwakeningDialog({
  dialogue,
  error,
  onClose,
  onAwaken,
}: AwakeningDialogProps) {
  const [selectedPath, setSelectedPath] = useState<AwakenedCombatPath | null>(null);
  const [pending, setPending] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const pendingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!error) return;
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, [error]);

  useEffect(() => () => {
    if (pendingTimerRef.current !== null) window.clearTimeout(pendingTimerRef.current);
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const selected = PATHS.find((path) => path.id === selectedPath) ?? null;
  const isPending = pending && !error;

  return (
    <div
      className={styles.overlay}
      data-game-ui="true"
      onClick={onClose}
      onPointerDown={stopWorldPointer}
      onPointerMove={stopWorldPointer}
      onPointerUp={stopWorldPointer}
    >
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="awakening-title"
        aria-describedby="awakening-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <span className={styles.masterSeal} aria-hidden="true">A</span>
          <div>
            <p>Maître du Quartier général</p>
            <h2 id="awakening-title">L’Éveil de rang E</h2>
          </div>
          <button className={styles.close} type="button" onClick={onClose} aria-label="Fermer le dialogue">×</button>
        </header>
        <p className={styles.srOnly} id="awakening-description">
          Dialogue de choix de spécialité auprès du Maître du Quartier général.
        </p>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        {dialogue.status === "level-required" ? (
          <div className={styles.stateMessage}>
            <span className={styles.stateIcon} aria-hidden="true">◇</span>
            <div>
              <h3>Ton potentiel n’est pas encore stabilisé.</h3>
              <p>
                Reviens au niveau général {dialogue.requiredLevel}. Tu es actuellement niveau {dialogue.currentLevel}.
              </p>
            </div>
            <button type="button" onClick={onClose}>Je reviendrai</button>
          </div>
        ) : dialogue.status === "completed" ? (
          <div className={styles.stateMessage}>
            <span className={styles.stateIcon} aria-hidden="true">✦</span>
            <div>
              <h3>Ton éveil est déjà accompli.</h3>
              <p>Tu es {dialogue.className}, rang {dialogue.rank ?? "E"}. Cette voie est désormais la tienne.</p>
            </div>
            <button type="button" onClick={onClose}>Continuer l’aventure</button>
          </div>
        ) : (
          <>
            <div className={styles.intro}>
              <p>« Choisis la force qui guidera chacun de tes combats. »</p>
              <span>Niveau requis atteint · Rang E disponible</span>
            </div>

            <div className={styles.pathGrid} aria-label="Choisir une spécialité">
              {PATHS.map((path) => {
                const active = selectedPath === path.id;
                return (
                  <button
                    key={path.id}
                    type="button"
                    className={`${styles.pathCard} ${active ? styles.pathCardActive : ""}`}
                    style={{ "--path-accent": path.accent } as CSSProperties}
                    aria-pressed={active}
                    disabled={isPending}
                    onClick={() => setSelectedPath(path.id)}
                  >
                    <span className={styles.pathIcon} aria-hidden="true">{path.icon}</span>
                    <strong>{path.name}</strong>
                    <small>{path.role}</small>
                    <p>{path.description}</p>
                    <span className={styles.pathChoice}>{active ? "Voie sélectionnée" : "Choisir cette voie"}</span>
                  </button>
                );
              })}
            </div>

            <footer className={`${styles.confirmation} ${selected ? styles.confirmationReady : ""}`}>
              <div>
                <strong>{selected ? `Confirmer la voie ${selected.name}` : "Sélectionne une voie"}</strong>
                <p>
                  Ce choix est définitif. Les maîtrises offensives provisoires seront remises à zéro,
                  puis 25 points seront attribués à la voie choisie. Ta Défense est conservée.
                </p>
              </div>
              <button
                type="button"
                disabled={!selected || isPending}
                onClick={() => {
                  if (!selected || isPending) return;
                  setPending(true);
                  onAwaken(selected.id);
                  pendingTimerRef.current = window.setTimeout(() => {
                    pendingTimerRef.current = null;
                    setPending(false);
                  }, 4_000);
                }}
              >
                {isPending
                  ? "Éveil en cours…"
                  : selected
                    ? `Confirmer ${selected.name} · Rang E`
                    : "Choix requis"}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
