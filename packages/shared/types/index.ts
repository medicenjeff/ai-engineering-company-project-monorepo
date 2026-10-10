export type Id = string;

export interface BaseEntity {
  id: Id;
  createdAt?: string;
  updatedAt?: string;
}

export type ProductCategory =
  "executive_search" | "customer_service_outsourcing" | "corporate_training";
export type SupplierStatus = "active" | "suspended";

export interface Proveedor {
  name: string;
  country: string;
  product_categories: [ProductCategory, ...ProductCategory[]];
  rate: number;
  status: SupplierStatus;
  updated_at: string;
}

export type NuevoProveedor = Omit<Proveedor, "updated_at">;
export type PaisDeResidencia = "España" | "Estados Unidos" | "Otro";
export type SectorDeInteres =
  "Tecnología" | "Retail" | "Servicios Financieros" | "Consultoría" | "Otro";
export type NivelDeIngles = "Básico" | "Intermedio" | "Avanzado" | "Nativo";
export type Disponibilidad = "Inmediata" | "1 mes" | "2-3 meses" | "Solo explorando";

export interface RegistroTalento {
  "Nombre completo": string;
  Email: string;
  Teléfono: string;
  "País de residencia": PaisDeResidencia;
  "Años de experiencia": number;
  "Sector de interés": SectorDeInteres;
  "Nivel de inglés": NivelDeIngles;
  Disponibilidad: Disponibilidad;
  "LinkedIn (URL del perfil)"?: string;
  "Comentarios adicionales"?: string;
  "Acepto política de datos": true;
}

export interface Servicio {
  name: "Headhunting Ejecutivo" | "Outsourcing de Atención al Cliente" | "Formación Corporativa";
  description: string;
}

export interface PostalAddress {
  "@type": "PostalAddress";
  addressCountry: "ES" | "US";
  addressLocality: "Valencia" | "Miami";
  addressRegion: "Comunidad Valenciana" | "Florida";
}

export interface ContactPoint {
  "@type": "ContactPoint";
  telephone: "+34-960-123-456";
  contactType: "customer service";
  availableLanguage: ["Spanish", "English"];
}

export interface Organization {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: "Nexova";
  description: "Consultora de recursos humanos y adquisición de talento";
  url: "https://nexova.com";
  foundingDate: "2011";
  address: PostalAddress[];
  contactPoint: ContactPoint;
  sameAs: ["https://linkedin.com/company/nexova", "https://instagram.com/nexova"];
}
