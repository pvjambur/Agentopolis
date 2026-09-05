import { useEffect } from 'react'

export function usePageTitle(pageTitle: string) {
  useEffect(() => {
    document.title = `Agentopolis — ${pageTitle}`
    return () => { document.title = 'Agentopolis' }
  }, [pageTitle])
}
