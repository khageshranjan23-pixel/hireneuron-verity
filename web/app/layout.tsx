import './globals.css';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'HireNeuron Verity | Evidence-first interviews',description:'Structured interviews. Traceable evidence. Human decisions.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
