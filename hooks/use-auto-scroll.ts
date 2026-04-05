"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { HermesMessage } from "@/hooks/use-hermes-bridge"

export function useAutoScroll(messages: HermesMessage[], isProcessing: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const userScrolledUpRef = useRef(false)
  const [showScrollDown, setShowScrollDown] = useState(false)

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const nearBottom = scrollHeight - scrollTop - clientHeight < 150
    isNearBottomRef.current = nearBottom
    userScrolledUpRef.current = !nearBottom
    setShowScrollDown(!nearBottom && scrollHeight > clientHeight + 300)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
      setShowScrollDown(false)
      userScrolledUpRef.current = false
      isNearBottomRef.current = true
    }
  }, [])

  /** Call after sending a message to force scroll */
  const resetScroll = useCallback(() => {
    userScrolledUpRef.current = false
    isNearBottomRef.current = true
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current!.scrollHeight, behavior: "smooth" })
    }, 50)
  }, [])

  // MutationObserver: auto-scroll on content changes (tool expansions, streaming)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new MutationObserver(() => {
      if (isNearBottomRef.current && !userScrolledUpRef.current) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
        })
      }
    })
    observer.observe(el, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  // Scroll on message changes (initial load, session switch)
  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current!.scrollHeight, behavior: "smooth" })
      })
    }
  }, [messages])

  // Scroll when processing starts (typing indicator)
  useEffect(() => {
    if (isProcessing && isNearBottomRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current!.scrollHeight, behavior: "smooth" })
      })
    }
  }, [isProcessing])

  return { scrollRef, handleScroll, scrollToBottom, showScrollDown, resetScroll }
}
