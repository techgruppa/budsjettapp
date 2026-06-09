import fullImg from "../full.png";
import middelsImg from "../middels.png";
import tomImg from "../tom.png";

export default function Bag({ fillPercent = 100 }) {
    // Velg riktig bilde basert på budsjettprosent
    let currentImg = fullImg;
    
    if (fillPercent < 10) {
        currentImg = tomImg;
    } else if (fillPercent < 60) {
        currentImg = middelsImg;
    }

    return (
        <img 
            src={currentImg} 
            alt={`Budsjettnivå: ${Math.round(fillPercent)}%`}
            style={{ 
                width: "110px", 
                height: "110px", 
                margin: "15px auto",
                display: "block",
                objectFit: "contain",
                filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.1))",
                transition: "all 0.3s ease"
            }} 
        />
    );
}
