import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdToken } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, firebaseConfigured } from '../firebase.js'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!firebaseConfigured || !auth || !db) { setLoading(false); return undefined }
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      setLoading(true)
      setAuthError('')
      if (!firebaseUser) { setUser(null); setLoading(false); return }
      try {
        const snap = await getDoc(doc(db, 'usuarios', firebaseUser.uid))
        if (!snap.exists()) {
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email ?? '', nome: firebaseUser.displayName ?? '', cargo: 'sem-perfil', lojaId: null, status: 'sem-perfil' })
        } else {
          const profile = snap.data()
          let status = profile.status ?? 'active'
          if (profile.lojaId) {
            try {
              const storeSnap = await getDoc(doc(db, 'lojas', profile.lojaId))
              if (storeSnap.exists()) {
                const store = storeSnap.data()
                if (store.status === 'suspended' || store.assinaturaStatus === 'suspended') status = 'suspended'
                if (store.assinaturaStatus === 'expired') status = 'expired'
                const period = store.assinaturaPeriodo || ''
                const expiration = store.assinaturaDataFim?.toDate ? store.assinaturaDataFim.toDate() : (store.assinaturaDataFim ? new Date(store.assinaturaDataFim) : null)
                if (status !== 'suspended' && expiration && expiration.getTime() <= Date.now() && (period !== 'vitalicio' || store.assinaturaStatus === 'trial')) status = 'expired'
              }
            } catch (storeError) { console.warn('Não foi possível consultar o estado da loja:', storeError) }
          }
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email ?? '', nome: String(profile.nome ?? firebaseUser.displayName ?? ''), cargo: String(profile.cargo ?? ''), lojaId: profile.lojaId ?? null, status, superAdmin: profile.superAdmin === true })
        }
      } catch (error) {
        console.error('Falha ao carregar perfil:', error)
        setAuthError('Não foi possível carregar seu perfil. Verifique sua conexão e as regras do Firestore.')
        setUser(null)
      } finally { setLoading(false) }
    }, error => { setAuthError(error.message); setUser(null); setLoading(false) })
    return unsubscribe
  }, [])

  const login = useCallback(async (email, password) => {
    if (!auth) throw new Error('Firebase não configurado. Preencha o .env antes de entrar.')
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
    return credential.user
  }, [])
  const logout = useCallback(async () => { if (auth) await signOut(auth); setUser(null) }, [])
  const getToken = useCallback(async () => {
    if (!auth?.currentUser) throw new Error('Sessão expirada. Entre novamente.')
    return getIdToken(auth.currentUser, true)
  }, [])
  const value = { user, loading, authError, login, logout, getToken, isSuperAdmin: user?.superAdmin === true || user?.cargo === 'superAdmin' }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() { return useContext(AuthContext) }
