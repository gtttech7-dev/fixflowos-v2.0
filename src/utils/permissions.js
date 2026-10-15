export const ROLES = { SUPER_ADMIN: 'superAdmin', ADMIN: 'admin', SELLER: 'vendedorTecnico', TECHNICIAN: 'tecnico' }
export const isAdmin = user => user?.cargo === ROLES.ADMIN || user?.superAdmin === true
export const isSuperAdmin = user => user?.superAdmin === true || user?.cargo === ROLES.SUPER_ADMIN
export const isSeller = user => user?.cargo === ROLES.SELLER
export const isTechnician = user => user?.cargo === ROLES.TECHNICIAN
export const canReadStock = user => [ROLES.ADMIN, ROLES.SELLER, ROLES.TECHNICIAN].includes(user?.cargo)
export const canManageStock = user => user?.cargo === ROLES.ADMIN
export const canReadFinance = user => user?.cargo === ROLES.ADMIN || isSuperAdmin(user)
export const canManageTeam = user => user?.cargo === ROLES.ADMIN || isSuperAdmin(user)
export const canManageOS = user => [ROLES.ADMIN, ROLES.SELLER, ROLES.TECHNICIAN].includes(user?.cargo)
export const isStoreMember = user => Boolean(user?.uid && user?.lojaId && user.cargo !== ROLES.SUPER_ADMIN)
