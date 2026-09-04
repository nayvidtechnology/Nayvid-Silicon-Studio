module counter #(
    parameter WIDTH = 8
)(
    input  logic             clk,
    input  logic             rst_n,
    input  logic             enable,
    output logic [WIDTH-1:0] count,
    output logic             done
);

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            count <= '0;
            done  <= 1'b0;
        end else if (enable) begin
            if (count == 8'hFF) begin
                done  <= 1'b1;
                count <= '0;
            end else begin
                count <= count + 1'b1;
                done  <= 1'b0;
            end
        end
    end

endmodule
